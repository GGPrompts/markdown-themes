package websocket

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"sync"

	"github.com/gorilla/websocket"

	"markdown-themes-backend/handlers"
)

// isValidPath rejects paths that contain newlines or are unreasonably long.
// Guards against the frontend accidentally sending file content as a path
// (e.g. during HMR state glitches).
func isValidPath(p string) bool {
	return len(p) <= 4096 && !strings.ContainsAny(p, "\n\r") && filepath.IsAbs(p)
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for local dev
	},
}

// Client represents a WebSocket connection
type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte

	// Subscriptions
	watchedFiles      map[string]bool
	watchedWorkspaces map[string]bool
	mu                sync.Mutex
}

// Hub maintains active clients and broadcasts messages
type Hub struct {
	// Registered clients
	clients map[*Client]bool

	// Register/unregister channels
	register   chan *Client
	unregister chan *Client

	// File watcher
	watcher *FileWatcher

	mu sync.RWMutex
}

// NewHub creates a new Hub
func NewHub() *Hub {
	h := &Hub{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
	h.watcher = NewFileWatcher(h)

	// Wire up terminal manager broadcast: PTY output → subscribed WS clients
	tm := handlers.GetTerminalManager()
	tm.SetBroadcastFunc(func(sessionID string, data []byte) {
		encoded := base64.StdEncoding.EncodeToString(data)
		msg := map[string]interface{}{
			"type":       "terminal-output",
			"terminalId": sessionID,
			"data":       encoded,
		}
		for _, c := range tm.GetClients(sessionID) {
			if client, ok := c.(*Client); ok {
				h.SendToClient(client, msg)
			}
		}
	})
	tm.SetClosedFunc(func(sessionID string) {
		msg := map[string]interface{}{
			"type":       "terminal-closed",
			"terminalId": sessionID,
		}
		for _, c := range tm.GetClients(sessionID) {
			if client, ok := c.(*Client); ok {
				h.SendToClient(client, msg)
			}
		}
	})

	return h
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("[Hub] Client connected, total: %d", len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				// Clean up file watches for this client
				client.mu.Lock()
				for path := range client.watchedFiles {
					h.watcher.RemoveFileWatch(path, client)
				}
				for path := range client.watchedWorkspaces {
					h.watcher.RemoveWorkspaceWatch(path, client)
				}
				client.mu.Unlock()

				// Clean up terminal subscriptions
				handlers.GetTerminalManager().RemoveAllClientSessions(client)

				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("[Hub] Client disconnected, total: %d", len(h.clients))
		}
	}
}

// SendToClient sends a message to a specific client
func (h *Hub) SendToClient(client *Client, message interface{}) {
	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("[Hub] Error marshaling message: %v", err)
		return
	}

	select {
	case client.send <- data:
	default:
		// Client buffer full, close connection
		h.mu.Lock()
		close(client.send)
		delete(h.clients, client)
		h.mu.Unlock()
	}
}

// Message types
type IncomingMessage struct {
	Type string `json:"type"`
	Path string `json:"path,omitempty"`
}

// HandleWebSocket upgrades HTTP connection to WebSocket
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Check token (simple validation)
	token := r.URL.Query().Get("token")
	if token != "markdown-themes-local-token" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WebSocket] Upgrade error: %v", err)
		return
	}

	client := &Client{
		hub:               h,
		conn:              conn,
		send:              make(chan []byte, 256),
		watchedFiles:      make(map[string]bool),
		watchedWorkspaces: make(map[string]bool),
	}

	h.register <- client

	// Send connected message
	h.SendToClient(client, map[string]string{"type": "connected"})

	// Start read/write pumps
	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WebSocket] Read error: %v", err)
			}
			break
		}

		var msg IncomingMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("[WebSocket] Invalid message: %v", err)
			continue
		}

		// Route terminal messages to the terminal handler
		if strings.HasPrefix(msg.Type, "terminal-") {
			clientSend := func(m interface{}) {
				c.hub.SendToClient(c, m)
			}
			handlers.HandleTerminalMessage(msg.Type, json.RawMessage(message), clientSend, c)
			continue
		}

		c.handleMessage(msg)
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()

	for message := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			log.Printf("[WebSocket] Write error: %v", err)
			return
		}
	}
}

func (c *Client) handleMessage(msg IncomingMessage) {
	switch msg.Type {
	case "file-watch":
		if msg.Path == "" || !isValidPath(msg.Path) {
			c.hub.SendToClient(c, map[string]interface{}{
				"type":  "file-watch-error",
				"error": "invalid path",
			})
			return
		}
		c.mu.Lock()
		c.watchedFiles[msg.Path] = true
		c.mu.Unlock()
		c.hub.watcher.AddFileWatch(msg.Path, c)

	case "file-unwatch":
		if msg.Path == "" {
			return
		}
		c.mu.Lock()
		delete(c.watchedFiles, msg.Path)
		c.mu.Unlock()
		c.hub.watcher.RemoveFileWatch(msg.Path, c)

	case "workspace-watch":
		if msg.Path == "" || !isValidPath(msg.Path) {
			c.hub.SendToClient(c, map[string]interface{}{
				"type":  "workspace-watch-error",
				"error": "invalid path",
			})
			return
		}
		c.mu.Lock()
		c.watchedWorkspaces[msg.Path] = true
		c.mu.Unlock()
		c.hub.watcher.AddWorkspaceWatch(msg.Path, c)

	case "workspace-unwatch":
		if msg.Path == "" {
			return
		}
		c.mu.Lock()
		delete(c.watchedWorkspaces, msg.Path)
		c.mu.Unlock()
		c.hub.watcher.RemoveWorkspaceWatch(msg.Path, c)

	case "ping":
		c.hub.SendToClient(c, map[string]string{"type": "pong"})

	default:
		log.Printf("[WebSocket] Unknown message type: %s", msg.Type)
	}
}
