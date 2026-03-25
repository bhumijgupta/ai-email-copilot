#!/bin/bash

##
## AI Email Copilot — Evaluation Launcher
##
## Runs the model evaluation judge, orchestrating runner.js and report.js
##
## Usage:
##   ./eval/run.sh [options]
##   bash eval/run.sh --models gemma3:4b,llama3.1:8b --tier 3
##
## Options:
##   --models <list>   Comma-separated models to test (default: gemma3:4b,llama3.1:8b)
##   --tier <number>   Test only fixtures from specific tier (1-5)
##   --help            Show this help message

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   https://nodejs.org/"
    exit 1
fi

# Check for Ollama
if ! command -v ollama &> /dev/null; then
    echo "⚠ Ollama is not in PATH. Make sure it's running:"
    echo "   OLLAMA_ORIGINS=\"*\" ollama serve"
fi

# Check Ollama connectivity
echo "Checking Ollama connection..."
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "❌ Cannot connect to Ollama at localhost:11434"
    echo "   Start Ollama with: OLLAMA_ORIGINS=\"*\" ollama serve"
    exit 1
fi

echo "✓ Ollama is running\n"

# Parse arguments
RUNNER_ARGS=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --models)
            RUNNER_ARGS="$RUNNER_ARGS --models $2"
            shift 2
            ;;
        --tier)
            RUNNER_ARGS="$RUNNER_ARGS --tier $2"
            shift 2
            ;;
        --help)
            echo "Usage: ./eval/run.sh [options]"
            echo ""
            echo "Options:"
            echo "  --models <list>   Comma-separated models (default: gemma3:4b,llama3.1:8b)"
            echo "  --tier <number>   Test only a specific difficulty tier (1-5)"
            echo "  --help            Show this message"
            echo ""
            echo "Examples:"
            echo "  ./eval/run.sh"
            echo "  ./eval/run.sh --models gemma3:4b,llama3.1:8b"
            echo "  ./eval/run.sh --tier 3"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run './eval/run.sh --help' for usage."
            exit 1
            ;;
    esac
done

# Run evaluation
echo "Starting model evaluation..."
echo ""
node "$SCRIPT_DIR/runner.js" $RUNNER_ARGS

# Generate report
echo ""
echo "Generating report..."
node "$SCRIPT_DIR/report.js"

echo "✓ Evaluation complete!"
