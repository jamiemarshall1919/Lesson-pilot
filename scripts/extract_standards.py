#!/usr/bin/env python3
"""
Extract standards from every PDF in ./pdfs
→ public/standards/{nys|england}/<subject>_standards.json
"""
import json, re, itertools, pdfplumber
from pathlib import Path

# ────────────────────────────────────────────────────────────────
# 1. subject_key ➜ exact PDF filename in ./pdfs  (edit names only)
# ────────────────────────────────────────────────────────────────
PDF_INFO = {
    # ---------- NYS ----------                                                          #
    "dance": "dance_standards.pdf",
    "media_arts": "media_arts_standards.pdf",
    "music": "music_standards.pdf",
    "theatre": "theatre_standards.pdf",
    "visual_arts": "visual_arts_standards.pdf",
    "cdos": "cdos_standards.pdf",
    "mathematics": "mathematics_standards.pdf",
    "ela": "ela_standards.pdf",
    "science": "science_standards.pdf",
    "social_studies_k8": "social_studies_k8_standards.pdf",
    "social_studies_hs": "social_studies_hs_standards.pdf",
    "computer_science": "computer_science_standards.pdf",
    "world_languages": "world_languages_standards.pdf",
    "health_pe_fcs": "health_pe_fcs_standards.pdf",
    "physical_education": "physical_education_standards.pdf",
    "technology": "technology_standards.pdf",

    # ---------- England – English ----------
    "eng_english_primary": "eng_english_primary.pdf",
    "eng_english_secondary": "eng_english_secondary.pdf",
    "eng_english_ks4": "eng_english_ks4.pdf",
    "eng_reading_framework": "reading_framework.pdf",
    "eng_letters_sounds": "letters_and_sounds.pdf",
    "eng_gcse_english_aqa": "aqa_gcse_eng_lang_spec.pdf",

    # ---------- England – Maths ----------
    "eng_mathematics_primary": "eng_mathematics_primary.pdf",
    "eng_mathematics_secondary": "eng_mathematics_secondary.pdf",
    "eng_mathematics_ks4": "eng_mathematics_ks4.pdf",
    "eng_mathematics_appendix1": "eng_mathematics_appendix1.pdf",

    # ---------- England – Science ----------
    "eng_science_primary": "eng_science_primary.pdf",
    "eng_science_secondary": "eng_science_secondary.pdf",
    "eng_science_ks4": "eng_science_ks4.pdf",

    # ---------- England – Humanities & Arts ----------
    "eng_geography_primary": "eng_geography_primary.pdf",
    "eng_geography_secondary": "eng_geography_secondary.pdf",
    "eng_history_primary": "eng_history_primary.pdf",
    "eng_history_secondary": "eng_history_secondary.pdf",
    "eng_art_design_primary": "eng_art_design_primary.pdf",
    "eng_art_design_secondary": "eng_art_design_secondary.pdf",
    "eng_music_primary": "eng_music_primary.pdf",
    "eng_music_secondary": "eng_music_secondary.pdf",

    # ---------- England – PE / DT / Computing / MFL / Citizenship ----------
    "eng_pe_primary": "eng_pe_primary.pdf",
    "eng_pe_secondary": "eng_pe_secondary.pdf",
    "eng_design_technology_primary": "eng_design_technology_primary.pdf",
    "eng_design_technology_secondary": "eng_design_technology_secondary.pdf",
    "eng_computing_primary": "eng_computing_primary.pdf",
    "eng_computing_secondary": "eng_computing_secondary.pdf",
    "eng_mfl_primary": "eng_mfl_primary.pdf",
    "eng_mfl_secondary": "eng_mfl_secondary.pdf",
    "eng_citizenship": "eng_citizenship_secondary.pdf",
}

# ────────────────────────────────────────────────────────────────
# 2. regex that matches *real* NYS codes
# ────────────────────────────────────────────────────────────────
CODE_RE = re.compile(
    r"^(?:"
    r"[DMTVA]{2}:[A-Z][a-zA-Z]*\.\d+\.\w+"      # NYS Arts
    r"|CDOS\s?\d(?:\.\d)?[a-z]?"                # CDOS
    r"|NY-\d+[A-Z]?\.[A-Z]{1,4}\.[0-9A-Z]+"     # NYS Math / ELA
    r"|NYSSLS-[0-9A-Z\-]+"                      # NYS Science
    r"|SS\.[0-9A-Z\-]+"                         # NYS Soc Studies
    r"|WL\.[A-Z]{2,4}\.\d+"                     # NYS World Languages
    r")$"
)

# column → grade lookup (NYS Arts PDFs)
BREAKS = [180, 270, 345, 415, 485, 555, 625, 695, 765, 835]
GRADES = ["Grade PK","Grade K","Grade 1","Grade 2","Grade 3",
          "Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","HSI"]

def col_to_grade(x):
    for idx, br in enumerate(BREAKS):
        if x < br:
            return GRADES[idx]
    return GRADES[-1]

def infer_grade(subject_key: str, code: str, fallback: str) -> str:
    """Infer a grade level from a NYS code, else fallback."""
    if subject_key in ("mathematics", "ela"):
        if m := re.search(r"NY-(\d+)", code):
            return f"Grade {m.group(1)}"
    if subject_key == "science":
        if m := re.search(r"NYSSLS-(\d)", code):
            return f"Grade {m.group(1)}"
    if subject_key.startswith("social_studies"):
        if m := re.search(r"SS\.([1-9])", code):
            return f"Grade {m.group(1)}"
    return fallback

# ────────────────────────────────────────────────────────────────
# 3. extract one PDF
# ────────────────────────────────────────────────────────────────
def extract(pdf_path: Path, subject_key: str) -> dict[str, list]:
    data: dict[str, list] = {}
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            rows = itertools.groupby(
                sorted(page.extract_words(), key=lambda w: w["top"]),
                key=lambda w: round(w["top"], 1)
            )
            for _, group in rows:
                row = list(group)
                code_word = next((w for w in row if CODE_RE.match(w["text"])), None)

                # ── England PDFs have no codes: fabricate KS-SUB-### ─────────
                if not code_word and subject_key.startswith("eng_"):
                    # Key Stage label from filename
                    if "_primary" in subject_key:
                        ks = "KS1-2"
                    elif "_secondary" in subject_key:
                        ks = "KS3"
                    elif "_ks4" in subject_key or "_gcse" in subject_key:
                        ks = "KS4"
                    else:
                        ks = "KS?"
                    subj_tag = subject_key.split("_")[1][:2].upper()   # EN, MA, SC…
                    counter = len(data.get(ks, [])) + 1
                    fake_code = f"{ks}-{subj_tag}-{counter:03d}"
                    code_word = {"x0": 0, "x1": 0, "text": fake_code}
                    grade_label = ks
                # ── NYS (or already-coded England guidance) ─────────────────
                else:
                    grade_guess = (
                        "K-12" if subject_key == "cdos" else
                        col_to_grade(code_word["x0"])
                    )
                    grade_label = infer_grade(subject_key, code_word["text"], grade_guess)

                if not code_word:         # still nothing? skip row
                    continue

                # description = everything to the right of the code column
                descr = " ".join(
                    w["text"] for w in row if w["x0"] > code_word["x1"]
                ).strip()

                data.setdefault(grade_label, []).append(
                    {"code": code_word["text"], "description": descr}
                )

    # sort codes inside each grade / KS
    for g in data:
        data[g].sort(key=lambda d: d["code"])
    return data

# ────────────────────────────────────────────────────────────────
# 4. iterate over every PDF → JSON
# ────────────────────────────────────────────────────────────────
for key, fname in PDF_INFO.items():
    pdf_path = Path("pdfs") / fname
    if not pdf_path.exists():
        print(f"⚠️  {fname} not found – skipping")
        continue

    out_dir = Path("public/standards/england") if key.startswith("eng_") \
              else Path("public/standards/nys")
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Extracting {key:>32}  ↦  {fname}")
    json_data = extract(pdf_path, key)
    out_file = out_dir / f"{key}_standards.json"
    out_file.write_text(json.dumps(json_data, indent=2))
    print(f"    → wrote {out_file.relative_to(Path.cwd())}")

print("All done 🎉")
