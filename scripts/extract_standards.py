import json, re, itertools, pdfplumber
from pathlib import Path
from tqdm import tqdm

# ----------------------------------------------------
#  PDF filenames (exact) mapped to a short subject key
# ----------------------------------------------------
PDF_INFO = {
    # ---- The Arts ----
    "dance":         "nys-dance-at-a-glance-final-8-2-2017-high-res-2.pdf",
    "media_arts":    "nys-media-arts-at-a-glance-final-8-13-2017-high-res.pdf",
    "music":         "nys-music-at-a-glance-final-8.2.2017-high-res-v2.pdf",
    "theatre":       "nys-theater-at-a-glance-final-8-2-2017-high-res.pdf",
    "visual_arts":   "nys-visual-arts-at-a-glance-final-8-2-2017-high-res-v2.pdf",

    # ---- Career Development & CDOS ----
    "cdos":          "cdoslea.pdf",

    # ---- Core subjects ----
    "mathematics":   "nys-next-generation-mathematics-p-12-standards.pdf",
    "ela":           "nys-next-generation-ela-standards.pdf",
    "science":       "p-12-science-learning-standards.pdf",
    "social_studies":"ss-framework-k-8a2.pdf",

    # ---- Extra sets you added ----
    "world_languages":"nys-learning-standards-for-world-languages.pdf",
    "health_pe_fcs": "learning-standards-for-health-physical-education-and-family-and-consumer-sciences-at-three-levels.pdf",
    "technology":    "learning-standards-for-math-science-and-technology-standard-1.pdf"
    # add more lines if you drop more PDFs later
}

# ---------------------------------------------
#  Regex that recognises every code style above
# ---------------------------------------------
CODE_RE = re.compile(
    r"^(?:"
    r"[DMTVA]{2}:[A-Z][a-zA-Z]*\.\d+\.\w+"               # Arts codes
    r"|CDOS\s?\d[a,b]?\.?\d*"                            # CDOS codes
    r"|NY-\d+[A-Z]?\.[A-Z]{1,4}\.[0-9A-Z]+"              # Math / ELA
    r"|NYSSLS-[0-9A-Z\-]+"                               # Science
    r"|SS\.[0-9A-Z\-]+"                                  # Soc Studies long form
    r"|WL\.[A-Z]{2,4}\.\d+"                              # World Languages
    r")$"
)

# ---- column positions for Arts PDFs (used as fallback) ----
BREAKS = [180, 270, 345, 415, 485, 555, 625, 695, 765, 835]
GRADES = [
    "Grade PK", "Grade K", "Grade 1", "Grade 2", "Grade 3",
    "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "HSI"
]

def col_to_grade(x):
    for idx, br in enumerate(BREAKS):
        if x < br:
            return GRADES[idx]
    return GRADES[-1]

def infer_grade(subject_key, code, fallback):
    """Extract grade from code string when possible."""
    if subject_key in ("mathematics", "ela"):
        m = re.search(r"NY-(\d+)", code)
        if m: return f"Grade {m.group(1)}"
    if subject_key == "science":
        m = re.search(r"NYSSLS-(\d)", code)
        if m: return f"Grade {m.group(1)}"
    if subject_key == "social_studies":
        m = re.search(r"SS\.([1-9])", code)
        if m: return f"Grade {m.group(1)}"
    return fallback

# ------------------------------------
#  Extractor core (unchanged logic)
# ------------------------------------
def extract(pdf_path, subject_key):
    data = {}
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            words = page.extract_words()
            rows = itertools.groupby(sorted(words, key=lambda w: w["top"]),
                                     key=lambda w: round(w["top"], 1))
            for _, group in rows:
                row = list(group)
                code_word = next((w for w in row if CODE_RE.match(w["text"])), None)
                if not code_word:
                    continue
                grade_guess = col_to_grade(code_word["x0"])
                grade = infer_grade(subject_key, code_word["text"], grade_guess)
                desc = " ".join(w["text"] for w in row if w["x0"] > code_word["x1"]).strip()
                data.setdefault(grade, []).append(
                    {"code": code_word["text"], "description": desc}
                )
    for g in data:
        data[g] = sorted(data[g], key=lambda d: d["code"])
    return data

# ----------------------------
#  Run extraction for all PDFs
# ----------------------------
OUT_DIR = Path("public/standards")
OUT_DIR.mkdir(parents=True, exist_ok=True)

for key, fname in PDF_INFO.items():
    pdf_path = Path("pdfs") / fname
    if not pdf_path.exists():
        print(f"⚠️  {fname} not found in pdfs/ – skipping")
        continue
    print(f"Extracting {key} ⇒ {fname}")
    json_data = extract(pdf_path, key)
    out_file = OUT_DIR / f"{key}_standards.json"
    out_file.write_text(json.dumps(json_data, indent=2))
    print(f"  → wrote {out_file}")

print("All done 🎉")
