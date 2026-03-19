import os
import tempfile
import traceback

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import whisper

app = FastAPI(title="Subtitle Tool API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = whisper.load_model("base")


def fmt_time(seconds: float) -> str:
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hrs:02}:{mins:02}:{secs:06.3f}"


def segments_to_vtt(segments) -> str:
    lines = ["WEBVTT", ""]

    for seg in segments:
        start = fmt_time(seg["start"])
        end = fmt_time(seg["end"])
        text = seg["text"].strip()

        if not text:
            continue

        lines.append(f"{start} --> {end}")
        lines.append(text)
        lines.append("")

    return "\n".join(lines)


@app.get("/")
def root():
    return {"status": "ok", "message": "Subtitle Tool backend is running."}


@app.get("/api/health")
def health():
    return {"status": "healthy"}


@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("auto"),
):
    temp_path = None

    try:
        if not file.filename:
            return JSONResponse(
                status_code=400,
                content={"error": "No file provided."},
            )

        suffix = os.path.splitext(file.filename)[1] or ".mp4"

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            temp_path = tmp.name

        kwargs = {"fp16": False}

        if language != "auto":
            kwargs["language"] = language

        result = model.transcribe(temp_path, **kwargs)
        segments = result.get("segments", [])
        transcript = result.get("text", "").strip()
        vtt = segments_to_vtt(segments)

        return {
            "transcript": transcript,
            "vtt": vtt,
        }

    except Exception as e:
        print("\n=== TRANSCRIBE ERROR ===")
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={"error": str(e)},
        )

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)