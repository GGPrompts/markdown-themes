package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// DB is the global database instance
var (
	instance *sql.DB
	once     sync.Once
)

// Conversation represents a stored chat conversation
type Conversation struct {
	ID              string          `json:"id"`
	Title           string          `json:"title"`
	CreatedAt       int64           `json:"createdAt"`
	UpdatedAt       int64           `json:"updatedAt"`
	Cwd             string          `json:"cwd,omitempty"`
	ClaudeSessionID string          `json:"claudeSessionId,omitempty"`
	Settings        json.RawMessage `json:"settings,omitempty"`
	Messages        []Message       `json:"messages"`
}

// Message represents a single chat message
type Message struct {
	ID              string          `json:"id"`
	ConversationID  string          `json:"conversationId"`
	Role            string          `json:"role"`
	Content         string          `json:"content"`
	Timestamp       int64           `json:"timestamp"`
	IsStreaming     bool            `json:"isStreaming,omitempty"`
	ToolUse         json.RawMessage `json:"toolUse,omitempty"`
	Usage           json.RawMessage `json:"usage,omitempty"`
	ModelUsage      json.RawMessage `json:"modelUsage,omitempty"`
	ClaudeSessionID string          `json:"claudeSessionId,omitempty"`
	CostUSD         *float64        `json:"costUSD,omitempty"`
	DurationMs      *float64        `json:"durationMs,omitempty"`
}

// ConversationListItem is a lightweight representation for listing conversations
type ConversationListItem struct {
	ID              string          `json:"id"`
	Title           string          `json:"title"`
	CreatedAt       int64           `json:"createdAt"`
	UpdatedAt       int64           `json:"updatedAt"`
	Cwd             string          `json:"cwd,omitempty"`
	ClaudeSessionID string          `json:"claudeSessionId,omitempty"`
	Settings        json.RawMessage `json:"settings,omitempty"`
	MessageCount    int             `json:"messageCount"`
	LastMessage     string          `json:"lastMessage,omitempty"`
}

// Init initializes the SQLite database and creates tables
func Init() (*sql.DB, error) {
	var initErr error
	once.Do(func() {
		dbPath := getDBPath()

		// Ensure directory exists
		dir := filepath.Dir(dbPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			initErr = fmt.Errorf("failed to create db directory: %w", err)
			return
		}

		db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000&_synchronous=NORMAL")
		if err != nil {
			initErr = fmt.Errorf("failed to open database: %w", err)
			return
		}

		// Test connection
		if err := db.Ping(); err != nil {
			initErr = fmt.Errorf("failed to ping database: %w", err)
			return
		}

		// Create tables
		if err := createTables(db); err != nil {
			initErr = fmt.Errorf("failed to create tables: %w", err)
			return
		}

		instance = db
		log.Printf("[DB] SQLite initialized at %s", dbPath)
	})

	return instance, initErr
}

// Get returns the database instance (must call Init first)
func Get() *sql.DB {
	return instance
}

func getDBPath() string {
	// Use XDG data home or fallback to ~/.local/share
	dataHome := os.Getenv("XDG_DATA_HOME")
	if dataHome == "" {
		home, _ := os.UserHomeDir()
		dataHome = filepath.Join(home, ".local", "share")
	}
	return filepath.Join(dataHome, "markdown-themes", "conversations.db")
}

func createTables(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS conversations (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL DEFAULT 'New conversation',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		cwd TEXT,
		claude_session_id TEXT,
		settings TEXT
	);

	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		conversation_id TEXT NOT NULL,
		role TEXT NOT NULL,
		content TEXT NOT NULL DEFAULT '',
		timestamp INTEGER NOT NULL,
		is_streaming INTEGER NOT NULL DEFAULT 0,
		tool_use TEXT,
		usage TEXT,
		model_usage TEXT,
		claude_session_id TEXT,
		cost_usd REAL,
		duration_ms REAL,
		FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
	CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
	CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
	`

	_, err := db.Exec(schema)
	return err
}

// ListConversations returns all conversations with metadata (no full messages)
func ListConversations() ([]ConversationListItem, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	rows, err := db.Query(`
		SELECT
			c.id, c.title, c.created_at, c.updated_at, c.cwd,
			c.claude_session_id, c.settings,
			COUNT(m.id) as message_count,
			(SELECT content FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message
		FROM conversations c
		LEFT JOIN messages m ON m.conversation_id = c.id
		GROUP BY c.id
		ORDER BY c.updated_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to list conversations: %w", err)
	}
	defer rows.Close()

	var conversations []ConversationListItem
	for rows.Next() {
		var c ConversationListItem
		var cwd, claudeSessionID sql.NullString
		var settings sql.NullString
		var lastMessage sql.NullString

		err := rows.Scan(&c.ID, &c.Title, &c.CreatedAt, &c.UpdatedAt,
			&cwd, &claudeSessionID, &settings,
			&c.MessageCount, &lastMessage)
		if err != nil {
			return nil, fmt.Errorf("failed to scan conversation: %w", err)
		}

		if cwd.Valid {
			c.Cwd = cwd.String
		}
		if claudeSessionID.Valid {
			c.ClaudeSessionID = claudeSessionID.String
		}
		if settings.Valid {
			c.Settings = json.RawMessage(settings.String)
		}
		if lastMessage.Valid {
			msg := lastMessage.String
			if len(msg) > 100 {
				msg = msg[:97] + "..."
			}
			c.LastMessage = msg
		}

		conversations = append(conversations, c)
	}

	if conversations == nil {
		conversations = []ConversationListItem{}
	}
	return conversations, nil
}

// GetConversation returns a full conversation with all messages
func GetConversation(id string) (*Conversation, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	conv := &Conversation{}
	var cwd, claudeSessionID sql.NullString
	var settings sql.NullString

	err := db.QueryRow(`
		SELECT id, title, created_at, updated_at, cwd, claude_session_id, settings
		FROM conversations WHERE id = ?
	`, id).Scan(&conv.ID, &conv.Title, &conv.CreatedAt, &conv.UpdatedAt,
		&cwd, &claudeSessionID, &settings)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get conversation: %w", err)
	}

	if cwd.Valid {
		conv.Cwd = cwd.String
	}
	if claudeSessionID.Valid {
		conv.ClaudeSessionID = claudeSessionID.String
	}
	if settings.Valid {
		conv.Settings = json.RawMessage(settings.String)
	}

	// Fetch messages
	rows, err := db.Query(`
		SELECT id, conversation_id, role, content, timestamp, is_streaming,
			   tool_use, usage, model_usage, claude_session_id, cost_usd, duration_ms
		FROM messages
		WHERE conversation_id = ?
		ORDER BY timestamp ASC
	`, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get messages: %w", err)
	}
	defer rows.Close()

	conv.Messages = []Message{}
	for rows.Next() {
		var m Message
		var isStreaming int
		var toolUse, usage, modelUsage, claudeSessionID sql.NullString
		var costUSD, durationMs sql.NullFloat64

		err := rows.Scan(&m.ID, &m.ConversationID, &m.Role, &m.Content, &m.Timestamp,
			&isStreaming, &toolUse, &usage, &modelUsage, &claudeSessionID,
			&costUSD, &durationMs)
		if err != nil {
			return nil, fmt.Errorf("failed to scan message: %w", err)
		}

		m.IsStreaming = isStreaming != 0
		if toolUse.Valid {
			m.ToolUse = json.RawMessage(toolUse.String)
		}
		if usage.Valid {
			m.Usage = json.RawMessage(usage.String)
		}
		if modelUsage.Valid {
			m.ModelUsage = json.RawMessage(modelUsage.String)
		}
		if claudeSessionID.Valid {
			m.ClaudeSessionID = claudeSessionID.String
		}
		if costUSD.Valid {
			m.CostUSD = &costUSD.Float64
		}
		if durationMs.Valid {
			m.DurationMs = &durationMs.Float64
		}

		conv.Messages = append(conv.Messages, m)
	}

	return conv, nil
}

// CreateConversation creates a new conversation
func CreateConversation(conv *Conversation) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	now := time.Now().UnixMilli()
	if conv.CreatedAt == 0 {
		conv.CreatedAt = now
	}
	if conv.UpdatedAt == 0 {
		conv.UpdatedAt = now
	}

	var settingsStr *string
	if conv.Settings != nil {
		s := string(conv.Settings)
		settingsStr = &s
	}

	_, err := db.Exec(`
		INSERT INTO conversations (id, title, created_at, updated_at, cwd, claude_session_id, settings)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, conv.ID, conv.Title, conv.CreatedAt, conv.UpdatedAt,
		nullString(conv.Cwd), nullString(conv.ClaudeSessionID), settingsStr)

	if err != nil {
		return fmt.Errorf("failed to create conversation: %w", err)
	}

	// Insert messages if provided
	if len(conv.Messages) > 0 {
		if err := insertMessages(db, conv.Messages); err != nil {
			return err
		}
	}

	return nil
}

// UpdateConversation updates a conversation's metadata and messages
func UpdateConversation(conv *Conversation) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	conv.UpdatedAt = time.Now().UnixMilli()

	var settingsStr *string
	if conv.Settings != nil {
		s := string(conv.Settings)
		settingsStr = &s
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		UPDATE conversations
		SET title = ?, updated_at = ?, cwd = ?, claude_session_id = ?, settings = ?
		WHERE id = ?
	`, conv.Title, conv.UpdatedAt, nullString(conv.Cwd),
		nullString(conv.ClaudeSessionID), settingsStr, conv.ID)

	if err != nil {
		return fmt.Errorf("failed to update conversation: %w", err)
	}

	// Replace messages: delete old, insert new
	if conv.Messages != nil {
		_, err = tx.Exec(`DELETE FROM messages WHERE conversation_id = ?`, conv.ID)
		if err != nil {
			return fmt.Errorf("failed to delete old messages: %w", err)
		}

		for _, m := range conv.Messages {
			m.ConversationID = conv.ID
			if err := insertMessageTx(tx, &m); err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

// DeleteConversation removes a conversation and its messages
func DeleteConversation(id string) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	// Messages are deleted by ON DELETE CASCADE
	result, err := db.Exec(`DELETE FROM conversations WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("failed to delete conversation: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("conversation not found")
	}

	return nil
}

// insertMessages inserts multiple messages in a transaction
func insertMessages(db *sql.DB, messages []Message) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	for i := range messages {
		if err := insertMessageTx(tx, &messages[i]); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func insertMessageTx(tx *sql.Tx, m *Message) error {
	isStreaming := 0
	if m.IsStreaming {
		isStreaming = 1
	}

	var toolUse, usage, modelUsage *string
	if m.ToolUse != nil {
		s := string(m.ToolUse)
		toolUse = &s
	}
	if m.Usage != nil {
		s := string(m.Usage)
		usage = &s
	}
	if m.ModelUsage != nil {
		s := string(m.ModelUsage)
		modelUsage = &s
	}

	_, err := tx.Exec(`
		INSERT OR REPLACE INTO messages
		(id, conversation_id, role, content, timestamp, is_streaming,
		 tool_use, usage, model_usage, claude_session_id, cost_usd, duration_ms)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, m.ID, m.ConversationID, m.Role, m.Content, m.Timestamp,
		isStreaming, toolUse, usage, modelUsage,
		nullString(m.ClaudeSessionID), m.CostUSD, m.DurationMs)

	if err != nil {
		return fmt.Errorf("failed to insert message: %w", err)
	}
	return nil
}

func nullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
