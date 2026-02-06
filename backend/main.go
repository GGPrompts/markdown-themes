package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"markdown-themes-backend/db"
	"markdown-themes-backend/handlers"
	"markdown-themes-backend/websocket"
)

func main() {
	// Initialize SQLite database
	if _, err := db.Init(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	log.Println("SQLite database initialized")

	// Get port from env or default to 8130
	port := os.Getenv("PORT")
	if port == "" {
		port = "8130"
	}

	// Create router
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:*", "http://127.0.0.1:*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Auth-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// JSON content type for API responses (except WebSocket and SSE endpoints)
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/ws" && !(r.URL.Path == "/api/chat" && r.Method == "POST") {
				w.Header().Set("Content-Type", "application/json")
			}
			next.ServeHTTP(w, r)
		})
	})

	// Create WebSocket hub
	hub := websocket.NewHub()
	go hub.Run()

	// Routes
	r.Route("/api", func(r chi.Router) {
		// Auth
		r.Get("/auth/token", handlers.AuthToken)

		// Files
		r.Get("/files/tree", handlers.FileTree)
		r.Get("/files/content", handlers.FileContent)
		r.Get("/files/git-status", handlers.GitStatus)

		// Claude
		r.Get("/claude/session", handlers.ClaudeSession)

		// Chat (AI conversations via Claude CLI)
		r.Post("/chat", handlers.Chat)
		r.Get("/chat/process", handlers.ChatProcessStatus)
		r.Delete("/chat/process", handlers.ChatProcessKill)

		// Conversation persistence (SQLite)
		r.Get("/chat/conversations", handlers.ConversationsList)
		r.Post("/chat/conversations", handlers.ConversationCreate)
		r.Get("/chat/conversations/{id}", handlers.ConversationGet)
		r.Put("/chat/conversations/{id}", handlers.ConversationUpdate)
		r.Delete("/chat/conversations/{id}", handlers.ConversationDelete)

		// Git
		r.Get("/git/repos", handlers.GitRepos)
		r.Get("/git/graph", handlers.GitGraph)
		r.Get("/git/commit/{hash}", handlers.GitCommitDetails)
		r.Get("/git/diff", handlers.GitDiff)

		// Git repo operations
		r.Post("/git/repos/{repo}/stage", handlers.GitRepoStage)
		r.Post("/git/repos/{repo}/unstage", handlers.GitRepoUnstage)
		r.Post("/git/repos/{repo}/commit", handlers.GitRepoCommit)
		r.Post("/git/repos/{repo}/push", handlers.GitRepoPush)
		r.Post("/git/repos/{repo}/pull", handlers.GitRepoPull)
		r.Post("/git/repos/{repo}/fetch", handlers.GitRepoFetch)
		r.Post("/git/repos/{repo}/discard", handlers.GitRepoDiscard)
		r.Post("/git/repos/{repo}/generate-message", handlers.GitRepoGenerateMessage)
	})

	// WebSocket
	r.Get("/ws", hub.HandleWebSocket)

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	log.Printf("markdown-themes backend starting on port %s", port)
	log.Printf("API: http://localhost:%s/api", port)
	log.Printf("WebSocket: ws://localhost:%s/ws", port)

	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}
