package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// ---- buildPTYEnv tests ----

func TestBuildPTYEnv_IncludesMDTTerminal(t *testing.T) {
	env := buildPTYEnv("test-session", 120, 30)
	if !envContains(env, "MDT_TERMINAL=1") {
		t.Error("expected MDT_TERMINAL=1 in env")
	}
}

func TestBuildPTYEnv_IncludesMDTSessionID(t *testing.T) {
	env := buildPTYEnv("my-session-123", 80, 24)
	if !envContains(env, "MDT_SESSION_ID=my-session-123") {
		t.Errorf("expected MDT_SESSION_ID=my-session-123 in env")
	}
}

func TestBuildPTYEnv_SetsTermXterm256color(t *testing.T) {
	env := buildPTYEnv("s1", 80, 24)
	if !envContains(env, "TERM=xterm-256color") {
		t.Error("expected TERM=xterm-256color")
	}
}

func TestBuildPTYEnv_SetsColumnsAndLines(t *testing.T) {
	env := buildPTYEnv("s1", 132, 43)
	if !envContains(env, "COLUMNS=132") {
		t.Error("expected COLUMNS=132")
	}
	if !envContains(env, "LINES=43") {
		t.Error("expected LINES=43")
	}
}

func TestBuildPTYEnv_RemovesParentTerminalVars(t *testing.T) {
	// Set parent terminal vars in the real env via t.Setenv (cleaned up automatically)
	for _, varName := range parentTerminalVars {
		t.Setenv(varName, "should-be-removed")
	}

	env := buildPTYEnv("s1", 80, 24)

	for _, varName := range parentTerminalVars {
		needle := varName + "="
		for _, entry := range env {
			if strings.HasPrefix(entry, needle) {
				t.Errorf("parent terminal var %s should have been removed, but found: %s", varName, entry)
			}
		}
	}
}

func TestBuildPTYEnv_SetsLANGFallback(t *testing.T) {
	// Ensure LANG is unset
	t.Setenv("LANG", "")

	env := buildPTYEnv("s1", 80, 24)
	if !envContains(env, "LANG=en_US.UTF-8") {
		t.Error("expected LANG=en_US.UTF-8 fallback")
	}
}

func TestBuildPTYEnv_PreservesExistingLANG(t *testing.T) {
	t.Setenv("LANG", "ja_JP.UTF-8")

	env := buildPTYEnv("s1", 80, 24)
	if !envContains(env, "LANG=ja_JP.UTF-8") {
		t.Error("expected existing LANG=ja_JP.UTF-8 to be preserved")
	}
}

func TestBuildPTYEnv_SetsColorTermAndForceColor(t *testing.T) {
	env := buildPTYEnv("s1", 80, 24)
	if !envContains(env, "COLORTERM=truecolor") {
		t.Error("expected COLORTERM=truecolor")
	}
	if !envContains(env, "FORCE_COLOR=1") {
		t.Error("expected FORCE_COLOR=1")
	}
}

// ---- CheckSpawnDedup tests ----

func newTestManager() *TerminalManager {
	return &TerminalManager{
		sessions:            make(map[string]*TerminalSession),
		disconnectTimers:    make(map[string]*time.Timer),
		recentSpawnRequests: make(map[string]time.Time),
		recentSpawnKeys:     make(map[string]time.Time),
	}
}

func TestCheckSpawnDedup_FirstRequestSucceeds(t *testing.T) {
	tm := newTestManager()
	err := tm.CheckSpawnDedup("req-1", "shell_/home")
	if err != nil {
		t.Errorf("first request should succeed, got: %v", err)
	}
}

func TestCheckSpawnDedup_DuplicateRequestRejected(t *testing.T) {
	tm := newTestManager()
	_ = tm.CheckSpawnDedup("req-1", "shell_/home")
	err := tm.CheckSpawnDedup("req-1", "other_/tmp")
	if err == nil {
		t.Error("duplicate requestId should be rejected")
	}
	if !strings.Contains(err.Error(), "duplicate spawn request") {
		t.Errorf("error should mention duplicate spawn request, got: %v", err)
	}
}

func TestCheckSpawnDedup_RequestSucceedsAfterTTL(t *testing.T) {
	tm := newTestManager()
	_ = tm.CheckSpawnDedup("req-1", "shell_/home")

	// Manually expire the entry
	tm.dedupMu.Lock()
	tm.recentSpawnRequests["req-1"] = time.Now().Add(-(spawnDedupTTL + time.Second))
	tm.dedupMu.Unlock()

	err := tm.CheckSpawnDedup("req-1", "other_/tmp")
	if err != nil {
		t.Errorf("request after TTL should succeed, got: %v", err)
	}
}

func TestCheckSpawnDedup_FirstSpawnKeySucceeds(t *testing.T) {
	tm := newTestManager()
	err := tm.CheckSpawnDedup("", "shell_/home")
	if err != nil {
		t.Errorf("first spawn key should succeed, got: %v", err)
	}
}

func TestCheckSpawnDedup_DuplicateSpawnKeyRejected(t *testing.T) {
	tm := newTestManager()
	_ = tm.CheckSpawnDedup("req-1", "shell_/home")
	err := tm.CheckSpawnDedup("req-2", "shell_/home")
	if err == nil {
		t.Error("duplicate spawn key within 500ms should be rejected")
	}
	if !strings.Contains(err.Error(), "duplicate spawn key") {
		t.Errorf("error should mention duplicate spawn key, got: %v", err)
	}
}

func TestCheckSpawnDedup_SpawnKeySucceedsAfter500ms(t *testing.T) {
	tm := newTestManager()
	_ = tm.CheckSpawnDedup("req-1", "shell_/home")

	// Manually expire the spawn key entry (> 500ms)
	tm.dedupMu.Lock()
	tm.recentSpawnKeys["shell_/home"] = time.Now().Add(-600 * time.Millisecond)
	tm.dedupMu.Unlock()

	err := tm.CheckSpawnDedup("req-2", "shell_/home")
	if err != nil {
		t.Errorf("spawn key after 500ms should succeed, got: %v", err)
	}
}

func TestCheckSpawnDedup_EmptyValuesSkipChecks(t *testing.T) {
	tm := newTestManager()
	// Both empty — should always succeed
	err := tm.CheckSpawnDedup("", "")
	if err != nil {
		t.Errorf("empty values should skip dedup checks, got: %v", err)
	}

	// Again — still succeeds because empty values are not recorded
	err = tm.CheckSpawnDedup("", "")
	if err != nil {
		t.Errorf("empty values should always succeed, got: %v", err)
	}
}

// ---- Profile HTTP handler tests ----

func TestTerminalProfilesHandler_ReturnsJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/terminal/profiles", nil)
	rr := httptest.NewRecorder()

	TerminalProfiles(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rr.Code)
	}

	var profiles []TerminalProfile
	if err := json.Unmarshal(rr.Body.Bytes(), &profiles); err != nil {
		t.Errorf("response body is not valid JSON: %v", err)
	}

	// Should have at least the default profile
	if len(profiles) == 0 {
		t.Error("expected at least one profile")
	}
}

func TestSaveTerminalProfileHandler_InvalidJSON(t *testing.T) {
	body := strings.NewReader("{invalid json")
	req := httptest.NewRequest(http.MethodPost, "/api/terminal/profiles", body)
	rr := httptest.NewRecorder()

	SaveTerminalProfile(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status 400 for invalid JSON, got %d", rr.Code)
	}
}

func TestSaveTerminalProfileHandler_SavesAndReturnsOK(t *testing.T) {
	profiles := []TerminalProfile{
		{ID: "test-1", Name: "Test Shell"},
		{ID: "test-2", Name: "Dev Server", Command: "npm run dev"},
	}
	data, _ := json.Marshal(profiles)
	body := strings.NewReader(string(data))
	req := httptest.NewRequest(http.MethodPost, "/api/terminal/profiles", body)
	rr := httptest.NewRecorder()

	SaveTerminalProfile(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d (body: %s)", rr.Code, rr.Body.String())
	}

	var resp map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Errorf("response is not valid JSON: %v", err)
	}
	if resp["status"] != "ok" {
		t.Errorf("expected status=ok, got %v", resp)
	}

	// Verify saved profiles can be loaded back
	loaded, err := LoadProfiles()
	if err != nil {
		t.Errorf("failed to load profiles after save: %v", err)
	}
	if len(loaded) != 2 {
		t.Errorf("expected 2 saved profiles, got %d", len(loaded))
	}
}

// ---- helpers ----

func envContains(env []string, needle string) bool {
	for _, entry := range env {
		if entry == needle {
			return true
		}
	}
	return false
}

// envValue returns the value of a key in the env slice, or empty string.
func envValue(env []string, key string) string {
	prefix := key + "="
	for _, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			return entry[len(prefix):]
		}
	}
	return ""
}

// Benchmark for dedup check (useful for profiling hot path)
func BenchmarkCheckSpawnDedup(b *testing.B) {
	tm := newTestManager()
	for i := 0; i < b.N; i++ {
		_ = tm.CheckSpawnDedup(fmt.Sprintf("req-%d", i), fmt.Sprintf("key-%d", i))
	}
}
