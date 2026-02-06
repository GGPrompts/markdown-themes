package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	"markdown-themes-backend/db"
)

// ConversationsList handles GET /api/chat/conversations
func ConversationsList(w http.ResponseWriter, r *http.Request) {
	conversations, err := db.ListConversations()
	if err != nil {
		log.Printf("[Conversations] Failed to list: %s", err)
		http.Error(w, `{"error": "failed to list conversations"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(conversations)
}

// ConversationGet handles GET /api/chat/conversations/{id}
func ConversationGet(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		http.Error(w, `{"error": "conversation id required"}`, http.StatusBadRequest)
		return
	}

	conv, err := db.GetConversation(id)
	if err != nil {
		log.Printf("[Conversations] Failed to get %s: %s", id, err)
		http.Error(w, `{"error": "failed to get conversation"}`, http.StatusInternalServerError)
		return
	}

	if conv == nil {
		http.Error(w, `{"error": "conversation not found"}`, http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(conv)
}

// ConversationCreate handles POST /api/chat/conversations
func ConversationCreate(w http.ResponseWriter, r *http.Request) {
	var conv db.Conversation
	if err := json.NewDecoder(r.Body).Decode(&conv); err != nil {
		http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
		return
	}

	if conv.ID == "" {
		http.Error(w, `{"error": "conversation id required"}`, http.StatusBadRequest)
		return
	}

	if err := db.CreateConversation(&conv); err != nil {
		log.Printf("[Conversations] Failed to create: %s", err)
		http.Error(w, `{"error": "failed to create conversation"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(conv)
}

// ConversationUpdate handles PUT /api/chat/conversations/{id}
func ConversationUpdate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		http.Error(w, `{"error": "conversation id required"}`, http.StatusBadRequest)
		return
	}

	var conv db.Conversation
	if err := json.NewDecoder(r.Body).Decode(&conv); err != nil {
		http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
		return
	}

	conv.ID = id

	if err := db.UpdateConversation(&conv); err != nil {
		log.Printf("[Conversations] Failed to update %s: %s", id, err)
		http.Error(w, `{"error": "failed to update conversation"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(conv)
}

// ConversationDelete handles DELETE /api/chat/conversations/{id}
func ConversationDelete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		http.Error(w, `{"error": "conversation id required"}`, http.StatusBadRequest)
		return
	}

	if err := db.DeleteConversation(id); err != nil {
		log.Printf("[Conversations] Failed to delete %s: %s", id, err)
		http.Error(w, `{"error": "failed to delete conversation"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Conversation deleted",
	})
}
