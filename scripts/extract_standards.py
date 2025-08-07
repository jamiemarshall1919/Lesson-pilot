#!/usr/bin/env python3
"""
Generate *_standards.json files from every PDF in `pdfs/`
One JSON per subject →  public/standards/nys/<subject>_standards.json
"""

import json, re, itertools, pdfplumber
from pathlib import Path
from tqdm import tqdm

# ────────────────────────────────────────────────────────────────
#  1.  Map <subject_key>  →  <PDF filename in pdfs/>
#      -------------------------------------------
#      Edit ONLY the right-hand filenames so they match exactly
#      whatever you saved inside the  pdfs/  folder.
# ────────────────────────────────────────────────────────────────
PDF_INFO = {
    # The Arts
    "dance":              "dance_standards.pdf",
    "media_arts":         "media_arts_standards.pdf",
    "music":              "music_standards.pdf",
    "theatre":            "theatre_standards.pdf",
    "visual_arts":        "visual_arts_standards.pdf",

    # Career Development
    "cdos":               "cdos_standards.pdf",

    # Core
    "mathematics":        "mathematics_standards.pdf",
    "ela":                "ela_standards.pdf",
    "science":            "science_standards.pdf",
    "social_studies_k8":  "social_studies_k8_standards.pdf",
    "social_studies_hs":  "social_studies_hs_standards.pdf",

    # Extra subjects
    "computer_science":   "computer_science.pdf",
    "world_languages":    "world_languages_standards.pdf",
    "health_pe_fcs":      "health_pe_fcs_standards.pdf",
    "physical_education": "physical_education_standards.pdf",
    "technology":         "technology_standards.pdf",
}

# ────────────────────────────────────────────────────────────────
#  2.  Regex patterns that recognise each standards code
# ────────────────────────────────────────────────────────────────
CODE_RE = re.compile(
    r"^(?:"
    r"[DMTVA]{2}:[A-Z][a-zA-Z]*\.\d+\.\w+"      # Arts
    r"|CDOS\s?\d(?:\.\d)?[a-z]?"                # CDOS 1 / 1.1a …
    r"|NY-\d+[A-Z]?\.[A-Z]{1,4}\.[0-9A-Z]+"     # Math / ELA
    r"|NYSSLS-[0-9A-Z\-]+"                      # Science
    r"|SS\.[0-9A-Z\-]+"                         # Social Studies
    r"|WL\.[A-Z]{2,4}\.\d+"                     # World Languages
    r")$"
)

# fallback grade hints for Arts table layout
BREAKS = [180, 270, 345, 415, 485, 555, 625, 695, 765, 835]
GRADES  = ["Grade PK","Grade K","Grade 1","Grade 2","Grade 3",
           "Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","HSI"]

def col_to_grade(x):
    for idx, br in enumerate(BREAKS):
        if x < br: return GRADES[idx]
    return GRADES[-1]

def infer_grade(subject_key: str, code: str, fallback: str) -> str:
    """Extract a grade from the code when possible"""
    if subject_key in ("mathematics", "ela"):
        m = re.search(r"NY-(\d+)", code)
        if m: return f"Grade {m.group(1)}"
    if subject_key == "science":
        m = re.search(r"NYSSLS-(\d)", code)
        if m: return f"Grade {m.group(1)}"
    if subject_key.startswith("social_studies"):
        m = re.search(r"SS\.([1-9])", code)
        if m: return f"Grade {m.group(1)}"
    return fallback

# ────────────────────────────────────────────────────────────────
#  3.  Extract one PDF → dict{grade:[{code,description},…]}
# ────────────────────────────────────────────────────────────────
def extract(pdf_path: Path, subject_key: str) -> dict:
    data = {}
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            words = page.extract_words()
            rows  = itertools.groupby(sorted(words, key=lambda w: w["top"]),
                                      key=lambda w: round(w["top"], 1))
            for _, group in rows:
                row = list(group)
                code_word = next((w for w in row if CODE_RE.match(w["text"])), None)
                if not code_word:
                    continue

                # For CDOS, everything is K-12 (no discrete grades)
                grade_guess = "K-12" if subject_key == "cdos" else col_to_grade(code_word["x0"])
                grade       = infer_grade(subject_key, code_word["text"], grade_guess)

                desc = " ".join(w["text"] for w in row if w["x0"] > code_word["x1"]).strip()
                data.setdefault(grade, []).append(
                    {"code": code_word["text"], "description": desc}
                )

    for g in data:
        data[g] = sorted(data[g], key=lambda d: d["code"])
    return data

# ────────────────────────────────────────────────────────────────
#  4.  Run over every PDF → JSON
# ────────────────────────────────────────────────────────────────
OUT_DIR = Path("public/standards/nys")
OUT_DIR.mkdir(parents=True, exist_ok=True)

for key, fname in PDF_INFO.items():
    pdf_path = Path("pdfs") / fname
    if not pdf_path.exists():
        print(f"⚠️  {fname} not found in pdfs/ – skipping")
        continue

    print(f"Extracting {key:>18}  ⇢  {fname}")
    json_data = extract(pdf_path, key)
    out_file  = OUT_DIR / f"{key}_standards.json"
    out_file.write_text(json.dumps(json_data, indent=2))
    print(f"  → wrote {out_file}")

print("All done 🎉")
