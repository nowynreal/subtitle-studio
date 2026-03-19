import { useEffect, useMemo, useRef, useState } from "react";

type ApiResponse = {
  transcript?: string;
  vtt?: string;
  error?: string;
};

type Cue = {
  start: string;
  end: string;
  text: string;
};

type EditorFormat = "vtt" | "ass";
type AlignmentOption =
  | "bottom-center"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "top-left"
  | "top-right";

type SubtitleStyle = {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  textColor: string;
  outlineEnabled: boolean;
  outlineColor: string;
  outlineSize: number;
  shadowEnabled: boolean;
  shadowSize: number;
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  rounded: boolean;
  paddingX: number;
  paddingY: number;
  marginV: number;
  lineSpacing: number;
  alignment: AlignmentOption;
  maxCharsPerLine: number;
  maxLines: number;
};

const DEFAULT_STYLE: SubtitleStyle = {
  fontFamily: "Arial",
  fontSize: 26,
  bold: true,
  italic: false,
  uppercase: false,
  textColor: "#ffffff",
  outlineEnabled: true,
  outlineColor: "#000000",
  outlineSize: 1,
  shadowEnabled: false,
  shadowSize: 2,
  backgroundEnabled: true,
  backgroundColor: "#000000",
  backgroundOpacity: 80,
  rounded: true,
  paddingX: 18,
  paddingY: 10,
  marginV: 28,
  lineSpacing: 0,
  alignment: "bottom-center",
  maxCharsPerLine: 38,
  maxLines: 2,
};

const STYLE_PRESETS: Record<string, Partial<SubtitleStyle>> = {
  "dark-box": {
    fontFamily: "Arial",
    fontSize: 26,
    bold: true,
    italic: false,
    uppercase: false,
    textColor: "#ffffff",
    outlineEnabled: true,
    outlineColor: "#000000",
    outlineSize: 1,
    shadowEnabled: false,
    shadowSize: 2,
    backgroundEnabled: true,
    backgroundColor: "#000000",
    backgroundOpacity: 80,
    rounded: true,
    paddingX: 18,
    paddingY: 10,
    marginV: 28,
    lineSpacing: 0,
    alignment: "bottom-center",
    maxCharsPerLine: 38,
    maxLines: 2,
  },
  cinematic: {
    fontFamily: "Georgia",
    fontSize: 28,
    bold: false,
    italic: false,
    uppercase: false,
    textColor: "#f8f5ee",
    outlineEnabled: true,
    outlineColor: "#111111",
    outlineSize: 1,
    shadowEnabled: false,
    shadowSize: 0,
    backgroundEnabled: true,
    backgroundColor: "#111111",
    backgroundOpacity: 55,
    rounded: false,
    paddingX: 16,
    paddingY: 8,
    marginV: 24,
    lineSpacing: 0,
    alignment: "bottom-center",
    maxCharsPerLine: 34,
    maxLines: 2,
  },
  promo: {
    fontFamily: "Arial",
    fontSize: 30,
    bold: true,
    italic: false,
    uppercase: true,
    textColor: "#ffffff",
    outlineEnabled: true,
    outlineColor: "#000000",
    outlineSize: 2,
    shadowEnabled: true,
    shadowSize: 2,
    backgroundEnabled: true,
    backgroundColor: "#000000",
    backgroundOpacity: 72,
    rounded: true,
    paddingX: 20,
    paddingY: 12,
    marginV: 34,
    lineSpacing: 0,
    alignment: "bottom-center",
    maxCharsPerLine: 30,
    maxLines: 2,
  },
  minimal: {
    fontFamily: "Helvetica",
    fontSize: 24,
    bold: false,
    italic: false,
    uppercase: false,
    textColor: "#ffffff",
    outlineEnabled: true,
    outlineColor: "#1a1a1a",
    outlineSize: 1,
    shadowEnabled: false,
    shadowSize: 0,
    backgroundEnabled: true,
    backgroundColor: "#18181b",
    backgroundOpacity: 48,
    rounded: true,
    paddingX: 14,
    paddingY: 8,
    marginV: 20,
    lineSpacing: 0,
    alignment: "bottom-center",
    maxCharsPerLine: 40,
    maxLines: 2,
  },
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function ensureWebVtt(content: string) {
  const trimmed = content.trim();
  if (!trimmed.startsWith("WEBVTT")) {
    return `WEBVTT\n\n${trimmed}`;
  }
  return content;
}

function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/plain;charset=utf-8",
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function extractFilenameWithoutExt(name: string) {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? name : name.slice(0, idx);
}

function parseVtt(vtt: string): Cue[] {
  const lines = vtt.replace(/\r/g, "").split("\n");
  const cues: Cue[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line || line === "WEBVTT") {
      i++;
      continue;
    }

    if (line.includes("-->")) {
      const [startRaw, endRaw] = line.split("-->");
      const start = startRaw.trim().split(" ")[0];
      const end = endRaw.trim().split(" ")[0];
      i++;

      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i++;
      }

      cues.push({
        start,
        end,
        text: textLines.join("\n").trim(),
      });
    } else {
      i++;
    }
  }

  return cues;
}

function vttTimeToAssTime(time: string) {
  const [h, m, sMs] = time.split(":");
  const [s, ms] = sMs.split(".");
  const centiseconds = Math.floor(Number(ms) / 10);
  return `${Number(h)}:${m}:${s}.${String(centiseconds).padStart(2, "0")}`;
}

function hexToAssBgr(hex: string) {
  const cleaned = hex.replace("#", "");
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;

  const r = normalized.slice(0, 2);
  const g = normalized.slice(2, 4);
  const b = normalized.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function opacityPercentToAssAlpha(opacityPercent: number) {
  const clamped = Math.max(0, Math.min(100, opacityPercent));
  const alpha = Math.round(((100 - clamped) / 100) * 255);
  return alpha.toString(16).padStart(2, "0").toUpperCase();
}

function wrapTextBalanced(
  text: string,
  maxCharsPerLine = 38,
  maxLines = 2,
  uppercase = false,
) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  const prepared = uppercase ? cleaned.toUpperCase() : cleaned;
  const words = prepared.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(word);
        current = "";
      }
    }
  }

  if (current) lines.push(current);

  if (lines.length <= maxLines) {
    return lines.join("\\N");
  }

  const kept = lines.slice(0, maxLines - 1);
  const rest = lines.slice(maxLines - 1).join(" ");
  kept.push(rest);

  return kept.join("\\N");
}

function alignmentToAss(alignment: AlignmentOption) {
  switch (alignment) {
    case "bottom-left":
      return 1;
    case "bottom-center":
      return 2;
    case "bottom-right":
      return 3;
    case "top-left":
      return 7;
    case "top-center":
      return 8;
    case "top-right":
      return 9;
    default:
      return 2;
  }
}

function styleToAssLine(style: SubtitleStyle) {
  const primary = hexToAssBgr(style.textColor);
  const outlineColor = hexToAssBgr(style.outlineColor);
  const outlineSize = style.outlineEnabled ? style.outlineSize : 0;
  const shadowSize = style.shadowEnabled ? style.shadowSize : 0;
  const borderStyle = style.backgroundEnabled ? 3 : 1;
  const backBase = style.backgroundEnabled ? style.backgroundColor : "#000000";
  const backAlpha = style.backgroundEnabled
    ? opacityPercentToAssAlpha(style.backgroundOpacity)
    : "FF";
  const backBgr = hexToAssBgr(backBase).replace("&H00", `&H${backAlpha}`);

  return `Style: Default,${style.fontFamily},${style.fontSize},${primary},&H000000FF,${outlineColor},${backBgr},${style.bold ? -1 : 0},${style.italic ? -1 : 0},0,0,100,100,0,0,${borderStyle},${outlineSize},${shadowSize},${alignmentToAss(style.alignment)},50,50,${style.marginV},1`;
}

function vttToAss(vtt: string, style: SubtitleStyle) {
  const cues = parseVtt(ensureWebVtt(vtt));
  const styleLine = styleToAssLine(style);

  const header = `[Script Info]
Title: Generated by Subtitle Tool
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLine}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = cues
    .map((cue) => {
      const start = vttTimeToAssTime(cue.start);
      const end = vttTimeToAssTime(cue.end);
      const wrapped = wrapTextBalanced(
        cue.text,
        style.maxCharsPerLine,
        style.maxLines,
        style.uppercase,
      );
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${wrapped}`;
    })
    .join("\n");

  return `${header}\n${events}\n`;
}

function getPreviewTextFromAss(ass: string) {
  const lines = ass.split("\n");
  const dialogueLine = lines.find((line) => line.startsWith("Dialogue:"));

  if (!dialogueLine) return "Your subtitle preview will appear here.";

  const parts = dialogueLine.split(",");
  if (parts.length < 10) return "Your subtitle preview will appear here.";

  const text = parts.slice(9).join(",").trim();
  return text.replace(/\\N/g, "\n");
}

function alignmentToPreviewPosition(alignment: AlignmentOption) {
  switch (alignment) {
    case "bottom-left":
      return "absolute bottom-10 left-10 text-left";
    case "bottom-center":
      return "absolute bottom-10 left-1/2 -translate-x-1/2 text-center";
    case "bottom-right":
      return "absolute bottom-10 right-10 text-right";
    case "top-left":
      return "absolute top-10 left-10 text-left";
    case "top-center":
      return "absolute top-10 left-1/2 -translate-x-1/2 text-center";
    case "top-right":
      return "absolute top-10 right-10 text-right";
    default:
      return "absolute bottom-10 left-1/2 -translate-x-1/2 text-center";
  }
}

function rgbaFromHex(hex: string, opacityPercent: number) {
  const cleaned = hex.replace("#", "");
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const a = Math.max(0, Math.min(100, opacityPercent)) / 100;

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function applyPreset(base: SubtitleStyle, presetName: string): SubtitleStyle {
  const preset = STYLE_PRESETS[presetName] || {};
  return { ...base, ...preset };
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
      <path
        d="M12 16V5M12 5L7.5 9.5M12 5L16.5 9.5M5 18.5H19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path
        d="M12 4V14M12 14L8 10M12 14L16 10M5 19H19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-zinc-300">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none transition hover:border-zinc-500 focus:border-zinc-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-zinc-300">{label}</label>
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 px-3 py-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cursor-pointer h-10 w-12 rounded border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-sm text-zinc-100 outline-none"
        />
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-45" : ""}>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-zinc-300">{label}</span>
        <span className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-400">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider cursor-pointer"
      />
    </div>
  );
}

function SegmentedToggle({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-zinc-300">{label}</label>
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`cursor-pointer rounded-xl px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                active
                  ? "bg-white text-black shadow"
                  : "bg-transparent text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="cursor-pointer flex items-center justify-between rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm transition hover:border-zinc-500 hover:bg-zinc-800 active:scale-[0.99]"
    >
      <span className="text-zinc-100">{label}</span>
      <span
        className={`relative h-6 w-11 rounded-full transition ${
          checked ? "bg-white" : "bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full transition ${
            checked ? "left-5.5 bg-black" : "left-0.5 bg-white"
          }`}
        />
      </span>
    </button>
  );
}

function LandingUpload({
  file,
  dragActive,
  setDragActive,
  onPickFile,
  onGenerate,
  loading,
  language,
  setLanguage,
  inputRef,
  error,
}: {
  file: File | null;
  dragActive: boolean;
  setDragActive: (v: boolean) => void;
  onPickFile: (selected?: File | null) => void;
  onGenerate: () => void;
  loading: boolean;
  language: string;
  setLanguage: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  error: string;
}) {
  const fileLabel = file
    ? `${file.name} • ${formatBytes(file.size)}`
    : "No file selected";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-88px)] max-w-4xl items-center px-4 py-10">
      <div className="w-full rounded-4xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl shadow-black/30 md:p-8">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs uppercase tracking-[0.22em] text-zinc-500">
            Subtitle Studio
          </div>
          <h2 className="text-3xl font-semibold text-white md:text-5xl">
            Upload video or audio
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
            Generate VTT subtitles instantly. Switch to ASS when you want full
            styling and export-ready subtitle formatting.
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) onPickFile(dropped);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-[28px] border border-dashed p-8 text-center transition md:p-10 ${
            dragActive
              ? "border-zinc-400 bg-zinc-800/70"
              : "border-zinc-700 bg-zinc-950/60 hover:border-zinc-500 hover:bg-zinc-900"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*,audio/*"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0] || null)}
          />
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900 text-zinc-200">
            <UploadIcon />
          </div>
          <p className="text-base font-medium text-white">
            Click or drag file here
          </p>
          <p className="mt-2 text-sm text-zinc-500">{fileLabel}</p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
          <SelectField
            label="Language"
            value={language}
            onChange={setLanguage}
            options={[
              { label: "Auto detect", value: "auto" },
              { label: "English", value: "en" },
              { label: "Turkish", value: "tr" },
            ]}
          />

          <div className="flex items-end">
            <button
              onClick={onGenerate}
              disabled={loading || !file}
              className="cursor-pointer inline-flex h-12.5 w-full items-center justify-center rounded-2xl bg-white px-6 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-white/10 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
            >
              {loading ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);

  const [editorFormat, setEditorFormat] = useState<EditorFormat>("vtt");
  const [vttText, setVttText] = useState("WEBVTT\n\n");
  const [assText, setAssText] = useState("");

  const [stylePreset, setStylePreset] = useState("dark-box");
  const [style, setStyle] = useState<SubtitleStyle>(DEFAULT_STYLE);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const baseName = useMemo(() => {
    return file ? extractFilenameWithoutExt(file.name) : "subtitles";
  }, [file]);

  const previewText = useMemo(() => getPreviewTextFromAss(assText), [assText]);

  useEffect(() => {
    setStyle((prev) => applyPreset(prev, stylePreset));
  }, [stylePreset]);

  useEffect(() => {
    setAssText(vttToAss(vttText, style));
  }, [vttText, style]);

  const onPickFile = (selected?: File | null) => {
    if (!selected) return;
    setFile(selected);
    setError("");
  };

  const handleTranscribe = async () => {
    if (!file) {
      setError("Önce video veya audio dosyası seç.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("language", language);

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data: ApiResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Transcription failed.");
      }

      const nextVtt = ensureWebVtt(data.vtt || "");
      setVttText(nextVtt);
      setTranscript(data.transcript || "");
      setHasGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadActive = () => {
    if (editorFormat === "vtt") {
      downloadTextFile(
        `${baseName}.vtt`,
        ensureWebVtt(vttText),
        "text/vtt;charset=utf-8",
      );
      return;
    }

    downloadTextFile(`${baseName}.ass`, assText, "text/plain;charset=utf-8");
  };

  if (!hasGenerated) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <style>{`
          .slider {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 8px;
            border-radius: 9999px;
            background: linear-gradient(90deg, #fafafa 0%, #52525b 100%);
            outline: none;
          }
          .slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 9999px;
            background: #ffffff;
            border: 2px solid #111827;
            box-shadow: 0 4px 14px rgba(0,0,0,0.35);
            cursor: pointer;
          }
          .slider::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 9999px;
            background: #ffffff;
            border: 2px solid #111827;
            box-shadow: 0 4px 14px rgba(0,0,0,0.35);
            cursor: pointer;
          }
        `}</style>

        <nav className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
          <div className="mx-auto flex max-w-425 items-center justify-between px-4 py-4 md:px-6">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                Subtitle Studio
              </div>
              <h1 className="text-lg font-semibold text-white">
                VTT / ASS Generator
              </h1>
            </div>
            <a
              href="https://github.com/nowynreal"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-400 hover:text-white"
            >
              Semih Yucekan
            </a>
          </div>
        </nav>

        <LandingUpload
          file={file}
          dragActive={dragActive}
          setDragActive={setDragActive}
          onPickFile={onPickFile}
          onGenerate={handleTranscribe}
          loading={loading}
          language={language}
          setLanguage={setLanguage}
          inputRef={inputRef}
          error={error}
        />
      </div>
    );
  }

  const activeEditorValue = editorFormat === "vtt" ? vttText : assText;
  const previewContainerPosition = alignmentToPreviewPosition(style.alignment);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <style>{`
        .slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 8px;
          border-radius: 9999px;
          background: linear-gradient(90deg, #fafafa 0%, #52525b 100%);
          outline: none;
        }
        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          background: #ffffff;
          border: 2px solid #111827;
          box-shadow: 0 4px 14px rgba(0,0,0,0.35);
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          background: #ffffff;
          border: 2px solid #111827;
          box-shadow: 0 4px 14px rgba(0,0,0,0.35);
          cursor: pointer;
        }
      `}</style>

      <nav className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-425 items-center justify-between px-4 py-4 md:px-6">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              Subtitle Studio
            </div>
            <h1 className="text-lg font-semibold text-white">
              VTT / ASS Generator
            </h1>
          </div>

          <button
            onClick={() => setHasGenerated(false)}
            className="cursor-pointer rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900 active:scale-[0.99]"
          >
            New Upload
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-425 px-4 md:px-6">
        <div className="mb-2 rounded-b-3xl border border-zinc-800 bg-zinc-900/60 px-6 py-3 text-sm text-zinc-300">
          {editorFormat === "vtt"
            ? "VTT mode focuses on fast editing, preview, and export."
            : "ASS mode unlocks full subtitle styling, live preview, and export-ready formatting."}
        </div>

        <div
          className={`grid gap-6 ${editorFormat === "ass" ? "xl:grid-cols-3" : "xl:grid-cols-[1fr_1fr]"}`}
        >
          <main className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-2xl shadow-black/20">
            <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-medium text-white">
                  {editorFormat === "vtt" ? "VTT Editor" : "ASS Editor"}
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {editorFormat === "vtt"
                    ? "Edit your VTT subtitles and export directly."
                    : "Edit styled ASS output after customizing the subtitle appearance."}
                </p>
              </div>

              <SegmentedToggle
                label="Editor Format"
                value={editorFormat}
                onChange={(value) => setEditorFormat(value as EditorFormat)}
                options={[
                  { label: "VTT", value: "vtt" },
                  { label: "ASS", value: "ass" },
                ]}
              />
            </div>

            <textarea
              value={activeEditorValue}
              onChange={(e) => {
                if (editorFormat === "vtt") {
                  setVttText(e.target.value);
                } else {
                  setAssText(e.target.value);
                }
              }}
              spellCheck={false}
              className="min-h-180 w-full resize-y rounded-2xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm leading-6 text-zinc-200 outline-none transition focus:border-zinc-500"
              placeholder={
                editorFormat === "vtt" ? "WEBVTT..." : "[Script Info] ..."
              }
            />

            <div className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-zinc-400">
                Current download source:{" "}
                <span className="font-semibold text-white">
                  {editorFormat.toUpperCase()} editor
                </span>
              </div>

              <button
                onClick={handleDownloadActive}
                className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-white/10 active:translate-y-0"
              >
                <DownloadIcon />
                Download {editorFormat.toUpperCase()}
              </button>
            </div>
          </main>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-2xl shadow-black/20">
            <div className="mb-4">
              <h2 className="text-lg font-medium text-white">Live Preview</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Preview and transcript stay in the middle column.
              </p>
            </div>

            <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">
              <div className="relative h-90 w-full bg-linear-to-br from-zinc-900 via-zinc-950 to-black">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_55%)]" />
                <div
                  className={`${previewContainerPosition} w-[%82] max-w-[82%]`}
                >
                  <div
                    className="inline-block w-fit max-w-full whitespace-pre-line wrap-break-word leading-tight shadow-xl"
                    style={{
                      color: style.textColor,
                      fontFamily: style.fontFamily,
                      fontSize: `${style.fontSize - 6}px`,
                      fontWeight: style.bold ? 700 : 400,
                      fontStyle: style.italic ? "italic" : "normal",
                      backgroundColor: style.backgroundEnabled
                        ? rgbaFromHex(
                            style.backgroundColor,
                            style.backgroundOpacity,
                          )
                        : "transparent",
                      padding: style.backgroundEnabled
                        ? `${style.paddingY + 2}px ${style.paddingX + 4}px`
                        : "0px",
                      borderRadius:
                        style.backgroundEnabled && style.rounded
                          ? "16px"
                          : "0px",
                      textTransform: style.uppercase ? "uppercase" : "none",
                      letterSpacing: style.uppercase ? "0.04em" : "0",
                      WebkitTextStroke: style.outlineEnabled
                        ? `${style.outlineSize}px ${style.outlineColor}`
                        : "0px transparent",
                      lineHeight:
                        style.lineSpacing === 0
                          ? "1.15"
                          : `${1.1 + style.lineSpacing / 100}`,
                      textShadow:
                        style.shadowEnabled && style.shadowSize > 0
                          ? `0 ${style.shadowSize}px ${style.shadowSize * 4}px rgba(0,0,0,0.45)`
                          : "none",
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {previewText}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <h3 className="text-sm font-medium text-zinc-200">
                Transcript preview
              </h3>
              <p className="mt-2 max-h-70 overflow-auto whitespace-pre-wrap text-sm leading-6 text-zinc-400">
                {transcript || "Henüz transcript yok."}
              </p>
            </div>
          </section>

          {editorFormat === "ass" ? (
            <aside className="rounded-3xl h-screen overflow-auto border border-zinc-800 bg-zinc-900/70 p-5 shadow-2xl shadow-black/20">
              <div className="mb-4">
                <h2 className="text-lg font-medium text-white">
                  Style Controls
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Full customization panel on the right.
                </p>
              </div>

              <div className="space-y-4">
                <Section title="Presets">
                  <SelectField
                    label="Preset"
                    value={stylePreset}
                    onChange={setStylePreset}
                    options={[
                      { label: "Dark Box", value: "dark-box" },
                      { label: "Cinematic", value: "cinematic" },
                      { label: "Promo", value: "promo" },
                      { label: "Minimal", value: "minimal" },
                    ]}
                  />
                  <button
                    onClick={() => setStyle(DEFAULT_STYLE)}
                    className="cursor-pointer rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800 active:scale-[0.99]"
                  >
                    Reset to Default
                  </button>
                </Section>

                <Section title="Typography">
                  <SelectField
                    label="Font Family"
                    value={style.fontFamily}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, fontFamily: value }))
                    }
                    options={[
                      { label: "Arial", value: "Arial" },
                      { label: "Helvetica", value: "Helvetica" },
                      { label: "Georgia", value: "Georgia" },
                      { label: "Trebuchet MS", value: "Trebuchet MS" },
                      { label: "Verdana", value: "Verdana" },
                      { label: "Tahoma", value: "Tahoma" },
                    ]}
                  />
                  <SliderField
                    label="Font Size"
                    value={style.fontSize}
                    min={12}
                    max={48}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, fontSize: value }))
                    }
                  />

                  <div className="grid gap-3 md:grid-cols-3">
                    <SwitchField
                      label="Bold"
                      checked={style.bold}
                      onChange={(value) =>
                        setStyle((prev) => ({ ...prev, bold: value }))
                      }
                    />
                    <SwitchField
                      label="Italic"
                      checked={style.italic}
                      onChange={(value) =>
                        setStyle((prev) => ({ ...prev, italic: value }))
                      }
                    />
                    <SwitchField
                      label="Uppercase"
                      checked={style.uppercase}
                      onChange={(value) =>
                        setStyle((prev) => ({ ...prev, uppercase: value }))
                      }
                    />
                  </div>

                  <ColorField
                    label="Text Color"
                    value={style.textColor}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, textColor: value }))
                    }
                  />
                </Section>

                <Section title="Outline">
                  <SwitchField
                    label="Enable Outline"
                    checked={style.outlineEnabled}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, outlineEnabled: value }))
                    }
                  />
                  <ColorField
                    label="Outline Color"
                    value={style.outlineColor}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, outlineColor: value }))
                    }
                  />
                  <SliderField
                    label="Outline Thickness"
                    value={style.outlineSize}
                    min={0}
                    max={6}
                    disabled={!style.outlineEnabled}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, outlineSize: value }))
                    }
                  />
                </Section>

                <Section title="Shadow">
                  <SwitchField
                    label="Enable Shadow"
                    checked={style.shadowEnabled}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, shadowEnabled: value }))
                    }
                  />
                  <SliderField
                    label="Shadow Size"
                    value={style.shadowSize}
                    min={0}
                    max={8}
                    disabled={!style.shadowEnabled}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, shadowSize: value }))
                    }
                  />
                </Section>

                <Section title="Background Box">
                  <SwitchField
                    label="Enable Background"
                    checked={style.backgroundEnabled}
                    onChange={(value) =>
                      setStyle((prev) => ({
                        ...prev,
                        backgroundEnabled: value,
                      }))
                    }
                  />
                  <ColorField
                    label="Background Color"
                    value={style.backgroundColor}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, backgroundColor: value }))
                    }
                  />
                  <SliderField
                    label="Background Opacity"
                    value={style.backgroundOpacity}
                    min={0}
                    max={100}
                    disabled={!style.backgroundEnabled}
                    onChange={(value) =>
                      setStyle((prev) => ({
                        ...prev,
                        backgroundOpacity: value,
                      }))
                    }
                  />
                  <SwitchField
                    label="Rounded Box"
                    checked={style.rounded}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, rounded: value }))
                    }
                  />
                  <SliderField
                    label="Padding X"
                    value={style.paddingX}
                    min={0}
                    max={40}
                    disabled={!style.backgroundEnabled}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, paddingX: value }))
                    }
                  />
                  <SliderField
                    label="Padding Y"
                    value={style.paddingY}
                    min={0}
                    max={24}
                    disabled={!style.backgroundEnabled}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, paddingY: value }))
                    }
                  />
                </Section>

                <Section title="Layout">
                  <SelectField
                    label="Alignment"
                    value={style.alignment}
                    onChange={(value) =>
                      setStyle((prev) => ({
                        ...prev,
                        alignment: value as AlignmentOption,
                      }))
                    }
                    options={[
                      { label: "Bottom Center", value: "bottom-center" },
                      { label: "Bottom Left", value: "bottom-left" },
                      { label: "Bottom Right", value: "bottom-right" },
                      { label: "Top Center", value: "top-center" },
                      { label: "Top Left", value: "top-left" },
                      { label: "Top Right", value: "top-right" },
                    ]}
                  />
                  <SliderField
                    label="Vertical Margin"
                    value={style.marginV}
                    min={0}
                    max={120}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, marginV: value }))
                    }
                  />
                  <SliderField
                    label="Line Spacing"
                    value={style.lineSpacing}
                    min={0}
                    max={40}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, lineSpacing: value }))
                    }
                  />
                </Section>

                <Section title="Wrapping">
                  <SliderField
                    label="Max Chars / Line"
                    value={style.maxCharsPerLine}
                    min={16}
                    max={60}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, maxCharsPerLine: value }))
                    }
                  />
                  <SliderField
                    label="Max Lines"
                    value={style.maxLines}
                    min={1}
                    max={4}
                    onChange={(value) =>
                      setStyle((prev) => ({ ...prev, maxLines: value }))
                    }
                  />
                </Section>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
