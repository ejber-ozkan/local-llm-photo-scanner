# Local AI Photo Gallery v3.8.0

Local LLM Photo Scanner is a self-contained, privacy-preserving app for
managing, searching, and collating metadata for personal photo collections on
your own machine.

It scans local directories with a locally hosted Large Language Model (LLM) to
generate natural-language scene descriptions. It also uses DeepFace facial
recognition to group unknown people and pets, making the gallery searchable
with intuitive natural-language queries.

## Features

### Core Features

- **Private local AI scanning**: Generate photo descriptions with a local
  Ollama vision model, enrich the gallery with EXIF metadata, and keep all
  processing on your own machine.
- **Semantic gallery search**: Combine CLIP visual embeddings, keyword search,
  entity filters, and visually similar photo matching to find images by meaning.
- **People, pets, and entity labeling**: Detect and cluster faces or pets with
  DeepFace, then rename or clean up labels from the gallery and test workflow.
- **Local folder library**: Index image/video folders without AI processing,
  browse them by folder or timeline, inspect duplicates, and extract richer
  media metadata when needed.
- **Background scan controls**: Start, pause, resume, cancel, and force-rescan
  AI or non-AI scans while progress and logs stay visible in the app.
- **Database and media tools**: Review duplicates, create or restore database
  backups, clean test or gallery data, preview videos, and transcode legacy
  formats with FFmpeg when available.

Recent polish includes the dedicated **Scan** and **Settings** pages, a merged
AI/non-AI scan panel, and safer Ollama warm-up/keep-alive behavior for longer
local scans. For detailed feature history and release-by-release changes, see
[CHANGELOG.md](CHANGELOG.md).

---

## Screenshots

<!-- markdownlint-disable MD013 -->

| Gallery & Visual Search | Single Image Testing & QA |
| --- | --- |
| ![Gallery View — Visual CLIP Search in Action](docs/screenshots/screenshot_clip_visual_search.png) | ![Test Scan — single image AI evaluation](docs/screenshots/screenshot_test_scan.png) |
| **Scan** | **Settings** |
| ![Scan — directory scanner and progress](docs/screenshots/screenshot_settings_scan.png) | ![Settings — appearance, backup/restore and database management](docs/screenshots/screenshot_settings_themes.png) |

| Local Folder Timeline Filters | Folder File Information & AI Actions |
| --- | --- |
| ![Local Folder Explorer timeline filters](docs/screenshots/folders_timeline_filters.png) | ![Folder file information and AI actions](docs/screenshots/folders_file_info_ai_actions.png) |
| **Timeline Day Drilldown** | |
| ![Local Folder Explorer timeline day drilldown](docs/screenshots/folders_timeline_days.png) | |

<!-- markdownlint-enable MD013 -->

---

## Technology Architecture & Stack

### Frontend Stack

- **React 18**: The core UI library used for building interactive interfaces.
- **Vite**: An ultra-fast build tool and development server.
- **TypeScript**: Provides static typing for safer code across components and
  API schemas.
- **Tailwind CSS**: Used for utility-first styling and the app's localized theme
  palette.
- **Axios**: For managing all asynchronous REST requests to the Python backend.
- **Frontend Testing**:
  - **Vitest**: A blazing fast unit test framework powered by Vite.
  - **React Testing Library (RTL)**: Tests React components in a user-centric
    way.
  - **MSW (Mock Service Worker)**: Mocks backend API calls for isolated frontend
    tests.

### Backend Stack

- **Python 3.10+**: Powers the API, database, and background tasks.
- **FastAPI**: Provides the Python API layer with interactive validation
  through Swagger UI and Pydantic schemas.
- **SQLite3**: Stores standardized image metadata, configuration, and
  AI-generated descriptions in a local file database.
- **ChromaDB**: Stores and queries 512-dimensional CLIP visual embeddings for
  semantic image-to-image matching.
- **Sentence-Transformers (OpenAI CLIP)**: Runs `clip-ViT-B-32` in memory to
  translate image pixels into queryable vector space.
- **DeepFace**: Handles facial extraction, clustering, and identification across
  disparate pictures.
- **Pillow (PIL)**: Processes, resizes, extracts Exif data, and streams image
  bytes to the interface.
- **Backend Testing**:
  - **Pytest**: Tests API endpoints and core state manipulation.
  - **Pytest-Cov**: Tracks coverage across routing modules and workers.
  - **Pytest-Asyncio**: Validates asynchronous network operations.
- **FFmpeg** *(optional)*: Enables server-side video transcoding for legacy
  formats such as AVI, WMV, FLV, 3GP, MPG, DivX, and RealMedia. Streams are sent
  to the browser as fragmented MP4 through FastAPI.

### Local AI Integrations

- **Ollama**: Runs local vision models like `qwen3-vl` or `llama3.2-vision` to
  write descriptive text about photos in the background.

---

## Prerequisites

Before running the application, install these dependencies. The app is used on
Windows 11 and Ubuntu/Linux.

1. **Python 3.10+**: Required for the FastAPI backend and AI processing libraries.
2. **Node.js (v20+) & npm**: Required to run the Vite/React frontend.
3. **Ollama**: Install [Ollama](https://ollama.com/) to run the local vision LLM.
4. **Ollama Vision Model**: Pull a vision-capable model such as `qwen3-vl:8b`,
   `llama3.2-vision:latest`, or `llava:13b`.

    ```bash
    ollama run qwen3-vl:8b
    ```

5. **FFmpeg** *(Optional — required for in-browser playback of legacy video formats)*:
    Install [FFmpeg](https://ffmpeg.org/download.html) and ensure the `ffmpeg`
    binary is on your system `PATH`. Without it, files like `.avi`, `.wmv`, and
    `.flv` show an "Open in System Player" button instead of playing in-browser.

    <!-- markdownlint-disable MD013 -->

    | Platform | Install Command |
    | --- | --- |
    | **Windows** | Download from [gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/), extract, add the `bin/` folder to your `PATH` |
    | **Linux (Ubuntu/Debian)** | `sudo apt install ffmpeg` |
    | **Linux (Fedora/RHEL)** | `sudo dnf install ffmpeg` |
    | **macOS** | `brew install ffmpeg` |

    <!-- markdownlint-enable MD013 -->

    Verify it is working: `ffmpeg -version`

---

## How to Build & Setup

### 1. Backend Setup

Open a terminal and navigate to the `backend` directory:

```bash
cd backend
```

Create a virtual environment and activate it:

**On Windows:**

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**On Linux/macOS:**

```bash
python -m venv venv
source venv/bin/activate
```

Install the required Python dependencies:

```bash
pip install -r requirements.txt
```

### 2. Frontend Setup

Open a new terminal and navigate to the `frontend` directory:

```bash
cd frontend
```

Install the required Node.js dependencies:

```bash
npm install
```

---

## How to Run

To use the application, run both the FastAPI backend and the React frontend
while Ollama is running in the background.

### 1. Ensure Ollama is Running

Make sure the Ollama service is active. By default, it runs on `http://localhost:11434`.

For AI scans, the backend sends a preload request before processing the first
image. The app also sends `keep_alive` with every Ollama request so large vision
models are less likely to unload mid-scan.

Recommended app settings for long scans:

**Windows PowerShell:**

```powershell
$env:OLLAMA_HOST = "127.0.0.1"
$env:OLLAMA_PORT = "11434"
$env:OLLAMA_KEEP_ALIVE = "30m"
$env:OLLAMA_PRELOAD_TIMEOUT = "180"
```

**Linux/macOS:**

```bash
export OLLAMA_HOST=127.0.0.1
export OLLAMA_PORT=11434
export OLLAMA_KEEP_ALIVE=30m
export OLLAMA_PRELOAD_TIMEOUT=180
```

Set `OLLAMA_KEEP_ALIVE` to a longer value such as `24h` for all-day scans, or
`-1` to keep the model loaded until you stop it manually. This uses more
VRAM/RAM, but avoids cold-start delays and first-image failures.

You can also manually preload the default vision model before starting a scan:

**Windows PowerShell:**

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:11434/api/generate" `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{
    model = "llama3.2-vision:latest"
    prompt = ""
    stream = $false
    keep_alive = "30m"
  } | ConvertTo-Json)
```

**Linux/macOS:**

```bash
curl http://127.0.0.1:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2-vision:latest",
    "prompt": "",
    "stream": false,
    "keep_alive": "30m"
  }'
```

To confirm what Ollama has loaded:

```bash
ollama ps
```

To unload a model manually:

```bash
ollama stop llama3.2-vision:latest
```

### 2. Start using provided scripts (Recommended)

You can start both backend and frontend components together from the root
directory. The scripts stop existing services on ports 8000 and 5173 before
starting fresh.

**On Windows:**
Double click `start.bat` in the file explorer, or run it from the terminal:

```cmd
.\start.bat
```

**On Linux/macOS:**
Make the script executable (only needed once) and run it:

```bash
chmod +x start.sh
./start.sh
```

### 3. How to Stop

To stop both the backend and frontend services:

**On Windows:**

```cmd
.\stop.bat
```

**On Linux/macOS:**

```bash
./stop.sh
```

### 4. Start Manually (Alternative)

If you prefer to start them separately:

**Start the Backend**
In your backend terminal (with your virtual environment activated):

```bash
cd backend
uvicorn photo_backend:app --host 0.0.0.0 --port 8000
```

**Start the Frontend**
In your frontend terminal:

```bash
cd frontend
npm run dev
```

### 4. Open the Application

Navigate to the URL provided by Vite in your web browser (typically `http://localhost:5173`).

Go to the **Scan** tab, enter the absolute path to a folder containing images
(for example, `C:\Users\YourName\Pictures`), and start the background scan.

### 5. Managing Your Database

If you need to restart from scratch or clear out test scans:

- **From the UI**: Navigate to **Settings** and scroll to Danger Zone. You can
  wipe the test sandbox or primary gallery DB using protected buttons.
- **Database Backups**: Use **Database Integrity & Backups** in Settings to
  create a timestamped backup or restore from a previous backup.
- **From the Backend CLI**: Run `clean_db.py` manually inside the `backend`
  environment:

  ```bash
  cd backend
  python clean_db.py --main
  # or
  python clean_db.py --test
  ```

### 6. Generate Python Documentation (PyDocs)

Developers extending the Python backend can generate interactive API and module
HTML documentation from the root directory:

**On Windows:**

```cmd
.\backend\venv\Scripts\python.exe generate_pydocs.py
```

**On Linux/macOS:**

```bash
./backend/venv/bin/python generate_pydocs.py
```

This creates a `docs` folder and writes the generated HTML schema inside.

### 7. Running Backend Tests

The backend uses `pytest` for unit and integration tests covering the REST API,
background worker, database setup, and mock AI interactions.

**Using the test runner script (Recommended):**

**On Windows:**

```cmd
.\run_tests_backend.bat
```

**On Linux/macOS:**

```bash
chmod +x run_tests_backend.sh
./run_tests_backend.sh
```

The script creates a virtual environment and installs dependencies if needed.
You can pass additional pytest arguments, e.g.:

```cmd
.\run_tests_backend.bat -k test_search
```

**Running manually:**

1. Ensure your virtual environment is activated in the `backend` folder.
2. Run the full test suite with coverage reporting:

   **On Windows:**

   ```powershell
   cd backend
   .\venv\Scripts\pytest -v --cov=.
   ```

   **On Linux/macOS:**

   ```bash
   cd backend
   ./venv/bin/pytest -v --cov=.
   ```

This uses an isolated test database and prints coverage metrics. You can append
`--cov-report=html` to generate an HTML coverage report.

### 8. Running Frontend Tests

The frontend test suite uses **Vitest**, **React Testing Library**, and **MSW**
(Mock Service Worker). Tests cover the main pages and the App shell.

**Using the test runner script (Recommended):**

**On Windows:**

```cmd
.\run_tests_frontend.bat
```

**On Linux/macOS:**

```bash
chmod +x run_tests_frontend.sh
./run_tests_frontend.sh
```

The script installs `node_modules` if needed. You can pass additional Vitest
arguments, e.g.:

```cmd
.\run_tests_frontend.bat --coverage
```

**Running manually:**

```bash
cd frontend
npm test          # interactive watch mode
npm run test:run  # single run (CI mode)
```

### 9. Versioning

The repository version is sourced from the root [`VERSION`](VERSION) file.

- Runtime and shell scripts read directly from `VERSION`.
- Frontend package metadata, README headings, and version test mocks are updated
  via the release helper:

```bash
python scripts/bump_version.py 3.0.0
```

You can also verify everything is aligned without changing files:

```bash
python scripts/bump_version.py --check
```

---

MIT
