.PHONY: all wasm wasm-dev native sdk cli build dev-demo dev-editor test lint clean install help

all: build

wasm:
	npm run build:wasm

wasm-dev:
	npm run build:wasm:dev

native:
	cargo build -p retro-platform-native

sdk:
	npm run build:sdk

cli:
	npm run build:cli

build: all

dev-demo:
	npm run dev:demo -- --port 3001

dev-editor:
	npm run dev:editor -- --port 3002

test:
	cargo test --workspace
	npm run test

lint:
	cargo clippy --workspace -- -D warnings
	cargo fmt --all -- --check
	npm run lint

clean:
	cargo clean
	rm -rf node_modules
	rm -rf packages/*/dist packages/*/node_modules
	rm -rf examples/*/dist examples/*/node_modules

install:
	npm install

help:
	@echo "Available targets:"
	@echo "  all          - Build everything"
	@echo "  wasm         - Build WASM release"
	@echo "  wasm-dev     - Build WASM dev"
	@echo "  native       - Build native desktop runtime"
	@echo "  sdk          - Build TypeScript SDK"
	@echo "  cli          - Build CLI"
	@echo "  build        - Compile everything"
	@echo "  dev-demo     - Run demo game server on port 3001"
	@echo "  dev-editor   - Run editor dev server on port 3002"
	@echo "  test         - Run cargo test and npm test"
	@echo "  lint         - Run cargo clippy/fmt and npm lint"
	@echo "  clean        - Clean build artifacts"
	@echo "  install      - Install npm dependencies"
	@echo "  help         - Show this help message"
