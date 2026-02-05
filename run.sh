#!/bin/bash
# markdown-themes dev runner

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  dev       Run both backend and frontend (default)"
    echo "  backend   Run Go backend only"
    echo "  frontend  Run frontend dev server only"
    echo "  build     Build Go backend binary"
    echo "  stop      Stop running processes"
    echo ""
    echo "Examples:"
    echo "  ./run.sh           # Start both servers"
    echo "  ./run.sh backend   # Start only backend"
    echo "  ./run.sh build     # Build backend binary"
}

build_backend() {
    echo -e "${BLUE}Building Go backend...${NC}"
    cd backend
    go build -o markdown-themes-backend .
    echo -e "${GREEN}Built: backend/markdown-themes-backend${NC}"
    cd ..
}

run_backend() {
    stop_backend
    echo -e "${BLUE}Starting Go backend on port 8130...${NC}"
    cd backend
    if [[ -f markdown-themes-backend ]]; then
        ./markdown-themes-backend
    else
        go run .
    fi
}

run_frontend() {
    stop_frontend
    echo -e "${BLUE}Starting frontend dev server on port 5173...${NC}"
    npm run dev
}

stop_backend() {
    if pgrep -f "markdown-themes-backend" > /dev/null; then
        echo -e "${BLUE}Stopping existing backend...${NC}"
        pkill -f "markdown-themes-backend" 2>/dev/null
        sleep 0.5
    fi
}

stop_frontend() {
    # Match vite processes in this project directory
    if pgrep -f "vite.*markdown-themes" > /dev/null || lsof -i :5173 > /dev/null 2>&1; then
        echo -e "${BLUE}Stopping existing frontend...${NC}"
        pkill -f "vite.*markdown-themes" 2>/dev/null || true
        # Also kill anything on port 5173 as fallback
        lsof -ti :5173 | xargs kill 2>/dev/null || true
        sleep 0.5
    fi
}

stop_all() {
    echo -e "${BLUE}Stopping processes...${NC}"
    stop_backend
    stop_frontend
    echo -e "${GREEN}Done${NC}"
}

run_dev() {
    # Stop existing processes first
    stop_backend
    stop_frontend

    # Check if backend is built
    if [[ ! -f backend/markdown-themes-backend ]]; then
        build_backend
    fi

    echo -e "${GREEN}Starting markdown-themes...${NC}"
    echo -e "  Backend:  http://localhost:8130"
    echo -e "  Frontend: http://localhost:5173"
    echo ""
    echo -e "${BLUE}Press Ctrl+C to stop${NC}"
    echo ""

    # Run backend in background (subshell so cd doesn't affect main shell)
    (cd backend && ./markdown-themes-backend) &
    BACKEND_PID=$!

    # Trap to kill backend when script exits
    trap "kill $BACKEND_PID 2>/dev/null" EXIT

    # Run frontend in foreground
    npm run dev
}

# Main
case "${1:-dev}" in
    dev)
        run_dev
        ;;
    backend)
        run_backend
        ;;
    frontend)
        run_frontend
        ;;
    build)
        build_backend
        ;;
    stop)
        stop_all
        ;;
    -h|--help|help)
        usage
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        usage
        exit 1
        ;;
esac
