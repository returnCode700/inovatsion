"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
type RawQ = { q: string; correct: string; wrong: string[] }
type QuizQ = { q: string; options: string[]; correctIdx: number }
type CatType = "parallel" | "longest" | "unique"
type Mode3Meta = { cat: CatType; tip: string }
type Section = "home" | "formSelect" | "quiz" | "fast" | "score"
type Mode = "form" | "shuffle" | "smart" | "fast" | null

// ═══════════════════════════════════════════════════════
// PARSE & CATEGORIZE
// ═══════════════════════════════════════════════════════
function parseQuestions(raw: string): RawQ[] {
  return raw
    .trim()
    // ++++ yoki undan ko'p + lar bilan bo'lish
    .split(/\+{4,}/g)
    .map((block) => {
      const parts = block
        .trim()
        // ==== yoki undan ko'p = lar bilan bo'lish
        .split(/={3,}/g)
        .map((s) => s.trim())
        .filter(Boolean)

      if (parts.length < 2) return null

      const question = parts[0]
      const options = parts.slice(1)

      let correct = ""
      const wrong: string[] = []

      options.forEach((opt) => {
        if (opt.startsWith("#")) {
          correct = opt.slice(1).trim()
        } else {
          wrong.push(opt)
        }
      })

      if (!correct || wrong.length === 0) return null

      return { q: question, correct, wrong } as RawQ
    })
    .filter((x): x is RawQ => Boolean(x))
}

function categorize(qData: RawQ): Mode3Meta {
  const cLower = qData.correct.toLowerCase()
  const allOpts = [qData.correct, ...qData.wrong]

  // Rule 1: "parallel" in correct answer
  if (cLower.includes("parallel")) {
    const withParallel = allOpts.filter((o) => o.toLowerCase().includes("parallel"))
    if (withParallel.length === 1) {
      return { cat: "parallel", tip: '💡 Yagona "parallel" so\'zi bor variant — to\'g\'ri javob' }
    } else {
      const correctWords = qData.correct.trim().split(/\s+/).length
      const maxParallelWords = Math.max(...withParallel.map((o) => o.trim().split(/\s+/).length))
      if (correctWords >= maxParallelWords) {
        return { cat: "parallel", tip: '💡 "Parallel" bor variantlar ichida eng uzuni — to\'g\'ri javob' }
      }
    }
  }

  // Rule 2: Correct is the longest option (by character length)
  const correctLen = qData.correct.trim().length
  const maxLen = Math.max(...allOpts.map((o) => o.trim().length))
  if (correctLen === maxLen && qData.wrong.some((w) => w.trim().length < correctLen)) {
    return { cat: "longest", tip: "💡 Eng uzun (belgilar bo'yicha) variant — to'g'ri javob" }
  }

  // Rule 3: Unique
  return { cat: "unique", tip: "💡 Bu javobni yodlab qoling" }
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildQ(raw: RawQ): QuizQ {
  const opts = shuffle([raw.correct, ...raw.wrong])
  return { q: raw.q, options: opts, correctIdx: opts.indexOf(raw.correct) }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

const FORM_SIZE = 20
const LETTERS = ["A", "B", "C", "D", "E", "F"]

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════
export default function Page() {
  const [allQuestions, setAllQuestions] = useState<RawQ[]>([])
  const [section, setSection] = useState<Section>("home")
  const [mode, setMode] = useState<Mode>(null)
  const [currentFormNum, setCurrentFormNum] = useState<number | null>(null)
  const [questions, setQuestions] = useState<QuizQ[]>([])
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [mode3Meta, setMode3Meta] = useState<Mode3Meta[]>([])
  const [showWarn, setShowWarn] = useState(false)

  // Fast mode state
  const [fastIdx, setFastIdx] = useState(0)
  const [fastFlash, setFastFlash] = useState<{ chosen: number; correct: number } | null>(null)
  const [fastAnswers, setFastAnswers] = useState<(number | null)[]>([])
  const [fastEnded, setFastEnded] = useState(false)

  // Timer
  const [seconds, setSeconds] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [finalTime, setFinalTime] = useState(0)

  // Back-to-top visibility
  const [showBackToTop, setShowBackToTop] = useState(false)

  // Score result
  const [score, setScore] = useState({ correct: 0, wrong: 0, skipped: 0, pct: 0 })

  // ── Load questions on mount ──
  useEffect(() => {
    fetch("/test-data.txt")
      .then((r) => r.text())
      .then((txt) => {
        setAllQuestions(parseQuestions(txt))
      })
      .catch((err) => console.log("[v0] Failed to load test data:", err))
  }, [])

  // ── Timer ticker ──
  useEffect(() => {
    if (!timerRunning) return
    const id = setInterval(() => {
      setSeconds((s) => s + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [timerRunning])

  // ── Back-to-top scroll listener ──
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400)
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const totalCount = allQuestions.length

  const startTimer = () => {
    setSeconds(0)
    setTimerRunning(true)
  }
  const stopTimer = () => {
    setTimerRunning(false)
    setFinalTime(seconds)
  }

  // ═══════════════════════════════════════════════════════
  // MODE STARTERS
  // ═══════════════════════════════════════════════════════
  const startForm = useCallback(
    (formNum: number) => {
      const start = (formNum - 1) * FORM_SIZE
      const end = Math.min(start + FORM_SIZE, totalCount)
      // Take in order, but shuffle the order of these 20 questions
      const slice = allQuestions.slice(start, end)
      const shuffledQs = shuffle(slice).map(buildQ)
      setMode("form")
      setCurrentFormNum(formNum)
      setMode3Meta([])
      setQuestions(shuffledQs)
      setUserAnswers(new Array(shuffledQs.length).fill(null))
      setSubmitted(false)
      setShowWarn(false)
      setSection("quiz")
      startTimer()
      window.scrollTo({ top: 0, behavior: "smooth" })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allQuestions, totalCount],
  )

  const startMode2 = useCallback(() => {
    const qs = shuffle(allQuestions).map(buildQ)
    setMode("shuffle")
    setCurrentFormNum(null)
    setMode3Meta([])
    setQuestions(qs)
    setUserAnswers(new Array(qs.length).fill(null))
    setSubmitted(false)
    setShowWarn(false)
    setSection("quiz")
    startTimer()
    window.scrollTo({ top: 0, behavior: "smooth" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allQuestions])

  const startMode3 = useCallback(() => {
    const cats: Record<CatType, { raw: RawQ; tip: string; cat: CatType }[]> = {
      parallel: [],
      longest: [],
      unique: [],
    }
    allQuestions.forEach((q) => {
      const { cat, tip } = categorize(q)
      cats[cat].push({ raw: q, tip, cat })
    })
    // Within each category, shuffle questions
    const ordered = [...shuffle(cats.parallel), ...shuffle(cats.longest), ...shuffle(cats.unique)]
    const qs = ordered.map((item) => buildQ(item.raw))
    const meta = ordered.map((item) => ({ cat: item.cat, tip: item.tip }))
    setMode("smart")
    setCurrentFormNum(null)
    setMode3Meta(meta)
    setQuestions(qs)
    setUserAnswers(new Array(qs.length).fill(null))
    setSubmitted(false)
    setShowWarn(false)
    setSection("quiz")
    startTimer()
    window.scrollTo({ top: 0, behavior: "smooth" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allQuestions])

  const startMode4 = useCallback(() => {
    const qs = shuffle(allQuestions).map(buildQ)
    setMode("fast")
    setCurrentFormNum(null)
    setMode3Meta([])
    setQuestions(qs)
    setFastAnswers(new Array(qs.length).fill(null))
    setFastIdx(0)
    setFastFlash(null)
    setFastEnded(false)
    setSubmitted(false)
    setSection("fast")
    startTimer()
    window.scrollTo({ top: 0, behavior: "auto" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allQuestions])

  const backToHome = () => {
    setSubmitted(false)
    setTimerRunning(false)
    setSection("home")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const showFormSelect = () => {
    setSection("formSelect")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // ═══════════════════════════════════════════════════════
  // STANDARD QUIZ ANSWER HANDLER
  // ═══════════════════════════════════════════════════════
  const handleAnswer = (qIdx: number, optIdx: number) => {
    setUserAnswers((prev) => {
      const next = prev.slice()
      next[qIdx] = optIdx
      return next
    })
  }

  // ═══════════════════════════════════════════════════════
  // SUBMIT (modes 1-3)
  // ═══════════════════════════════════════════════════════
  const computeAndShowScore = useCallback(
    (answers: (number | null)[], qs: QuizQ[]) => {
      let correct = 0,
        wrong = 0,
        skipped = 0
      qs.forEach((q, i) => {
        if (answers[i] === null) skipped++
        else if (answers[i] === q.correctIdx) correct++
        else wrong++
      })
      const pct = qs.length > 0 ? Math.round((correct / qs.length) * 100) : 0
      setScore({ correct, wrong, skipped, pct })
      stopTimer()
      setSection("score")
      window.scrollTo({ top: 0, behavior: "smooth" })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seconds],
  )

  const submitAll = () => {
    const unanswered = userAnswers.filter((a) => a === null).length
    if (unanswered > 0 && !submitted) {
      const ok = window.confirm(
        `${unanswered} ta savol hali javobsiz. Shunga qaramay natijani ko'rmoqchimisiz?`,
      )
      if (!ok) {
        setShowWarn(true)
        return
      }
    }
    setSubmitted(true)
    computeAndShowScore(userAnswers, questions)
  }

  const reviewAnswers = () => {
    setSection("quiz")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const restartQuiz = () => {
    if (mode === "form" && currentFormNum != null) startForm(currentFormNum)
    else if (mode === "shuffle") startMode2()
    else if (mode === "smart") startMode3()
    else if (mode === "fast") startMode4()
  }

  // ═══════════════════════════════════════════════════════
  // FAST MODE handlers
  // ═══════════════════════════════════════════════════════
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleFastAnswer = (optIdx: number) => {
    if (fastFlash !== null || fastEnded) return
    const q = questions[fastIdx]
    setFastFlash({ chosen: optIdx, correct: q.correctIdx })
    setFastAnswers((prev) => {
      const n = prev.slice()
      n[fastIdx] = optIdx
      return n
    })
    // Shortest possible animation — 180ms flash, then advance
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = setTimeout(() => {
      setFastFlash(null)
      if (fastIdx + 1 >= questions.length) {
        // Done — show score
        const finalAnswers = (() => {
          const n = fastAnswers.slice()
          n[fastIdx] = optIdx
          return n
        })()
        setFastEnded(true)
        computeAndShowScore(finalAnswers, questions)
      } else {
        setFastIdx((i) => i + 1)
      }
    }, 180)
  }

  const finishFastEarly = () => {
    // Allow user to see results without finishing
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    const unanswered = fastAnswers.filter((a) => a === null).length
    if (unanswered > 0) {
      const ok = window.confirm(
        `${unanswered} ta savol hali javobsiz. Shunga qaramay natijani ko'rmoqchimisiz?`,
      )
      if (!ok) return
    }
    setFastEnded(true)
    computeAndShowScore(fastAnswers, questions)
  }

  // ═══════════════════════════════════════════════════════
  // PROGRESS
  // ═══════════════════════════════════════════════════════
  const answeredCount = useMemo(() => userAnswers.filter((a) => a !== null).length, [userAnswers])
  const progressPct =
    questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0

  // ═══════════════════════════════════════════════════════
  // CATEGORY HEADERS (Mode 3)
  // ═══════════════════════════════════════════════════════
  const catLabels: Record<CatType, { cls: string; icon: string; label: string; desc: string }> = {
    parallel: {
      cls: "parallel",
      icon: "🔵",
      label: "Parallel Qoidasi",
      desc: 'Bu guruhdagi savollarda to\'g\'ri javob "parallel" so\'zini o\'z ichiga oladi. Bir nechta variantda "parallel" uchrasa — eng uzuni to\'g\'ri!',
    },
    longest: {
      cls: "longest",
      icon: "🟠",
      label: "Eng Uzun Variant",
      desc: "Bu savollar guruhida to'g'ri javob har doim eng uzun variant hisoblanadi. Eng ko'p belgilar/so'zlar — o'sha to'g'ri!",
    },
    unique: {
      cls: "unique",
      icon: "🟢",
      label: "Noyob Javoblar",
      desc: "Bu savollar yuqoridagi qoidalarga to'g'ri kelmaydi. Ularni to'g'ridan-to'g'ri yodlab olish tavsiya etiladi.",
    },
  }

  // Quiz title/subtitle
  const quizTitle =
    mode === "form" && currentFormNum != null
      ? `Variant ${currentFormNum}`
      : mode === "shuffle"
        ? "To'liq Aralash Test"
        : mode === "smart"
          ? "Aqlli O'rganish Rejimi"
          : "Test"

  const quizSubtitle =
    mode === "form" && currentFormNum != null
      ? (() => {
          const start = (currentFormNum - 1) * FORM_SIZE + 1
          const end = Math.min(currentFormNum * FORM_SIZE, totalCount)
          return `${start}–${end} savollar oralig'idan · Savollar va javob variantlari aralashtirilgan`
        })()
      : mode === "shuffle"
        ? `Barcha ${totalCount} ta savol va javob variantlari tasodifiy aralashtirilgan`
        : mode === "smart"
          ? "Savollar qoidaga ko'ra guruhlanib, har birida maslahat ko'rsatiladi. Javob variantlari aralashtirilgan."
          : ""

  const quizBadgeMode =
    mode === "form" && currentFormNum != null
      ? `📋 Variant ${currentFormNum}`
      : mode === "shuffle"
        ? "🔀 Aralash rejim"
        : mode === "smart"
          ? (() => {
              const pc = mode3Meta.filter((m) => m.cat === "parallel").length
              const lc = mode3Meta.filter((m) => m.cat === "longest").length
              const uc = mode3Meta.filter((m) => m.cat === "unique").length
              return `🔵${pc} 🟠${lc} 🟢${uc}`
            })()
          : ""

  // Score visuals
  const scoreClass =
    score.pct >= 90 ? "excellent" : score.pct >= 75 ? "good" : score.pct >= 50 ? "fair" : "poor"
  const scoreTitle =
    score.pct >= 90
      ? "🏆 A'lo natija!"
      : score.pct >= 75
        ? "👍 Yaxshi natija!"
        : score.pct >= 50
          ? "📚 O'rta daraja"
          : "📖 Ko'proq o'qish kerak"
  const scoreDesc =
    score.pct >= 90
      ? "Tabriklaymiz! Siz testni ajoyib darajada yakunladingiz."
      : score.pct >= 75
        ? "Bilimingiz yaxshi. Bir oz takrorlash bilan mukammal bo'lasiz."
        : score.pct >= 50
          ? "Asosiy tushunchalar yaxshi. Zaif tomonlarni takrorlang."
          : "Qo'shimcha o'qish va takrorlash tavsiya etiladi."

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" })

  // Loading state
  if (totalCount === 0) {
    return (
      <>
        <div className="top-bar"></div>
        <div className="page-header">
          <div className="form-header-card">
            <div className="form-title">Yuklanmoqda…</div>
            <div className="form-subtitle">Savollar bazasi yuklanmoqda, biroz kuting.</div>
          </div>
        </div>
      </>
    )
  }

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <>
      <div className="top-bar"></div>

      {/* ═══════════════ HOME ═══════════════ */}
      {section === "home" && (
        <div>
          <div className="page-header">
            <div className="form-header-card">
              <div className="form-title">Innovatsiya Integratsiya</div>
              <div className="form-subtitle">
                Bilimingizni sinab ko&apos;ring — {totalCount} ta savol, 4 xil rejim
              </div>
              <div className="form-meta">
                <span className="badge">📚 {totalCount} ta savol</span>
                <span className="badge">🔀 Har urinishda aralashtiriladi</span>
                <span className="badge">⚡ 4 ta rejim</span>
              </div>
            </div>
          </div>
          <div className="home-section">
            <div className="mode-cards-grid">
              <button className="mode-card mode-card-1" onClick={showFormSelect}>
                <div className="mode-icon">📋</div>
                <div className="mode-card-content">
                  <div className="mode-card-title">1-Rejim: Variantlar bo&apos;yicha</div>
                  <div className="mode-card-desc">
                    Savollar 20 talik variantlarga bo&apos;lingan (tartib bo&apos;yicha
                    bo&apos;linadi). Har urinishda variant ichidagi savollar va javob variantlari
                    aralashtiriladi.
                  </div>
                  <div className="mode-card-meta">
                    <span className="mode-meta-chip">
                      📄 {Math.ceil(totalCount / FORM_SIZE)} ta variant
                    </span>
                    <span className="mode-meta-chip">{FORM_SIZE} ta savol/variant</span>
                    <span className="mode-meta-chip">🔀 Aralashtiriladi</span>
                  </div>
                </div>
              </button>

              <button className="mode-card mode-card-2" onClick={startMode2}>
                <div className="mode-icon">🔀</div>
                <div className="mode-card-content">
                  <div className="mode-card-title">2-Rejim: To&apos;liq aralash</div>
                  <div className="mode-card-desc">
                    Barcha {totalCount} ta savol va javob variantlari to&apos;liq aralashtiriladi.
                    Har urinishda boshqacha tartib.
                  </div>
                  <div className="mode-card-meta">
                    <span className="mode-meta-chip">❓ {totalCount} ta savol</span>
                    <span className="mode-meta-chip">🔀 Savol va javoblar aralash</span>
                  </div>
                </div>
              </button>

              <button className="mode-card mode-card-3" onClick={startMode3}>
                <div className="mode-icon">🧠</div>
                <div className="mode-card-content">
                  <div className="mode-card-title">3-Rejim: Aqlli o&apos;rganish</div>
                  <div className="mode-card-desc">
                    Savollar to&apos;g&apos;ri javob qoidasi bo&apos;yicha guruhlangan:
                    &quot; Eng uzun variant, va noyob javoblar. Har birida
                    eslatma ko&apos;rsatiladi.
                  </div>
                  <div className="mode-card-meta">
                    <span className="mode-meta-chip">🔵 Parallel qoidasi</span>
                    <span className="mode-meta-chip">🟠 Eng uzun variant</span>
                    <span className="mode-meta-chip">🟢 Noyob javoblar</span>
                  </div>
                </div>
              </button>

              <button className="mode-card mode-card-4" onClick={startMode4}>
                <div className="mode-icon">⚡</div>
                <div className="mode-card-content">
                  <div className="mode-card-title">4-Rejim: Tezkor rejim</div>
                  <div className="mode-card-desc">
                    Savollar bittadan ko&apos;rsatiladi. Javob bosishingiz bilan keyingi savolga
                    o&apos;tasiz va testni tugatgach natijani darhol ko&apos;rasiz. Sekundomer
                    yoniq.
                  </div>
                  <div className="mode-card-meta">
                    <span className="mode-meta-chip">⚡ Tezkor</span>
                    <span className="mode-meta-chip">⏱ Sekundomer</span>
                    <span className="mode-meta-chip">🔀 Aralash</span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ FORM SELECT ═══════════════ */}
      {section === "formSelect" && (
        <div>
          <div className="page-header">
            <div className="form-header-card">
              <div className="form-title">Variant tanlang</div>
              <div className="form-subtitle">
                Har bir variantda {FORM_SIZE} ta savol mavjud. Savollar va javob variantlari har
                urinishda aralashtiriladi.
              </div>
              <div className="form-meta">
                <button
                  className="btn btn-outline"
                  style={{ padding: "6px 14px", fontSize: 13 }}
                  onClick={backToHome}
                >
                  ← Orqaga
                </button>
              </div>
            </div>
          </div>
          <div className="home-section">
            <div className="form-grid">
              {Array.from({ length: Math.ceil(totalCount / FORM_SIZE) }).map((_, idx) => {
                const f = idx + 1
                const start = idx * FORM_SIZE
                const end = Math.min(start + FORM_SIZE, totalCount)
                const count = end - start
                return (
                  <button key={f} className="form-chip" onClick={() => startForm(f)}>
                    <div className="form-chip-num">{f}</div>
                    <div className="form-chip-label">
                      Variant {f} · {count} ta savol
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ QUIZ (modes 1, 2, 3) ═══════════════ */}
      {section === "quiz" && (
        <div>
          <div className="page-header">
            <div className="form-header-card">
              <div className="form-title">{quizTitle}</div>
              <div className="form-subtitle">{quizSubtitle}</div>
              <div className="form-meta">
                <span className="badge">📄 {questions.length} ta savol</span>
                <span className="badge">{quizBadgeMode}</span>
                <span className="timer-chip">
                  ⏱ {formatTime(submitted ? finalTime : seconds)}
                </span>
              </div>
            </div>
          </div>

          <div className="form-body">
            <div className="progress-card">
              <div className="progress-info">
                <span>
                  {answeredCount} / {questions.length} ta javob berildi
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progressPct}%` }}></div>
              </div>
            </div>

            <div className="nav-dots-wrap">
              <div className="nav-dots-label">Savollar navigatsiyasi</div>
              <div className="nav-dots">
                {questions.map((_, i) => {
                  let cls = "nav-dot"
                  if (submitted) {
                    if (userAnswers[i] === null) cls += " wrong-dot"
                    else if (userAnswers[i] === questions[i].correctIdx) cls += " correct-dot"
                    else cls += " wrong-dot"
                  } else if (userAnswers[i] !== null) {
                    cls += " answered"
                  }
                  return (
                    <button
                      key={i}
                      className={cls}
                      onClick={() => {
                        const el = document.getElementById(`q${i}`)
                        el?.scrollIntoView({ behavior: "smooth", block: "center" })
                      }}
                    >
                      {i + 1}
                    </button>
                  )
                })}
              </div>
            </div>

            {showWarn && (
              <div className="unanswered-warn">
                ⚠️ Bir nechta savollar javobsiz qoldi. Iltimos, barcha savollarga javob bering yoki
                natijani ko&apos;rish uchun &quot;Natijani ko&apos;rish&quot; tugmasini qayta
                bosing.
              </div>
            )}

            <div>
              {questions.map((q, i) => {
                const isSubmitted = submitted
                const userAns = userAnswers[i]
                const isCorrect = isSubmitted && userAns === q.correctIdx
                const isIncorrect = isSubmitted && userAns !== null && userAns !== q.correctIdx
                const isSkipped = isSubmitted && userAns === null

                let cardCls = "question-card"
                if (isSubmitted) cardCls += " submitted"
                if (!isSubmitted && userAns !== null) cardCls += " answered"
                if (isCorrect) cardCls += " correct"
                if (isIncorrect || isSkipped) cardCls += " incorrect"

                // Category header for mode 3
                const showCatHeader =
                  mode3Meta.length > 0 &&
                  (i === 0 || mode3Meta[i].cat !== mode3Meta[i - 1].cat)
                const catInfo = showCatHeader ? catLabels[mode3Meta[i].cat] : null

                return (
                  <div key={i}>
                    {catInfo && (
                      <div className={`cat-header-card ${catInfo.cls}`}>
                        <div className="cat-header-title">
                          {catInfo.icon} {catInfo.label}
                        </div>
                        <div className="cat-header-desc">{catInfo.desc}</div>
                      </div>
                    )}
                    <div className={cardCls} id={`q${i}`}>
                      <div className="question-number">
                        Savol {i + 1} / {questions.length}
                      </div>
                      {mode3Meta[i] && (
                        <div className={`hint-chip ${mode3Meta[i].cat}`}>
                          {mode3Meta[i].tip}
                        </div>
                      )}
                      <div className="question-text">{q.q}</div>
                      <div className="options-list">
                        {q.options.map((opt, j) => {
                          let optCls = "option-item"
                          if (isSubmitted) {
                            if (j === q.correctIdx) optCls += " correct-option"
                            else if (userAns === j) optCls += " wrong-option"
                          }
                          return (
                            <label key={j} className={optCls}>
                              <input
                                type="radio"
                                name={`q${i}`}
                                value={j}
                                checked={userAns === j}
                                disabled={isSubmitted}
                                onChange={() => handleAnswer(i, j)}
                              />
                              <span className="option-label">
                                <strong>{LETTERS[j]}.</strong> {opt}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                      {isSubmitted && (
                        <>
                          {isCorrect && (
                            <span className="result-badge correct">✅ To&apos;g&apos;ri!</span>
                          )}
                          {isIncorrect && (
                            <span className="result-badge incorrect">
                              ❌ Noto&apos;g&apos;ri — To&apos;g&apos;ri:{" "}
                              {LETTERS[q.correctIdx]}
                            </span>
                          )}
                          {isSkipped && (
                            <span className="result-badge incorrect">
                              ⏭ O&apos;tkazilgan — To&apos;g&apos;ri: {LETTERS[q.correctIdx]}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Sticky bar */}
          <div className="sticky-bar">
            <div className="sticky-inner">
              <button className="btn btn-outline" onClick={backToHome}>
                🏠 Bosh sahifa
              </button>
              {!submitted && (
                <button className="btn btn-primary" onClick={submitAll}>
                  ✅ Natijani ko&apos;rish
                </button>
              )}
              {submitted && (
                <>
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setSection("score")
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }}
                  >
                    📊 Natijaga qaytish
                  </button>
                  <button className="btn btn-success" onClick={restartQuiz}>
                    🔄 Qayta boshlash
                  </button>
                </>
              )}
              <span className="answered-count">
                <strong>{answeredCount}</strong> / {questions.length} javob
              </span>
            </div>
          </div>

          {/* Back-to-top button */}
          <button
            className={`back-to-top ${showBackToTop ? "" : "hidden-btt"}`}
            onClick={scrollToTop}
            aria-label="Tepaga qaytish"
          >
            ⬆ Tepaga qaytish
          </button>
        </div>
      )}

      {/* ═══════════════ FAST MODE ═══════════════ */}
      {section === "fast" && questions.length > 0 && !fastEnded && (
        <div>
          <div className="page-header">
            <div className="form-header-card">
              <div className="form-title">⚡ Tezkor rejim</div>
              <div className="form-subtitle">
                Javobni bosing — keyingi savolga avtomatik o&apos;tasiz. Sekundomer yoniq.
              </div>
              <div className="form-meta">
                <span className="badge">
                  Savol {fastIdx + 1} / {questions.length}
                </span>
                <span className="timer-chip">⏱ {formatTime(seconds)}</span>
                <span className="badge">
                  ✅{" "}
                  {fastAnswers.filter((a, i) => a !== null && a === questions[i].correctIdx).length}{" "}
                  · ❌{" "}
                  {
                    fastAnswers.filter(
                      (a, i) => a !== null && a !== questions[i].correctIdx,
                    ).length
                  }
                </span>
              </div>
            </div>
          </div>

          <div className="form-body">
            <div className="progress-card">
              <div className="progress-info">
                <span>
                  {fastAnswers.filter((a) => a !== null).length} / {questions.length} ta javob
                </span>
                <span>
                  {Math.round(
                    (fastAnswers.filter((a) => a !== null).length / questions.length) * 100,
                  )}
                  %
                </span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${
                      Math.round(
                        (fastAnswers.filter((a) => a !== null).length / questions.length) * 100,
                      )
                    }%`,
                    transition: "width 0.15s ease",
                  }}
                ></div>
              </div>
            </div>
          </div>

          <div className="fast-question-wrap">
            <div className="fast-card">
              <div className="question-number">
                Savol {fastIdx + 1} / {questions.length}
              </div>
              <div className="question-text" style={{ marginTop: 6 }}>
                {questions[fastIdx].q}
              </div>
              <div>
                {questions[fastIdx].options.map((opt, j) => {
                  let cls = "fast-option-btn"
                  if (fastFlash !== null) {
                    if (j === fastFlash.correct) cls += " flash-correct"
                    else if (j === fastFlash.chosen) cls += " flash-wrong"
                  }
                  return (
                    <button
                      key={j}
                      className={cls}
                      disabled={fastFlash !== null}
                      onClick={() => handleFastAnswer(j)}
                    >
                      <span className="fast-letter">{LETTERS[j]}</span>
                      <span style={{ flex: 1 }}>{opt}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="sticky-bar">
            <div className="sticky-inner">
              <button className="btn btn-outline" onClick={backToHome}>
                🏠 Bosh sahifa
              </button>
              <button className="btn btn-primary" onClick={finishFastEarly}>
                ✅ Natijani ko&apos;rish
              </button>
              <span className="answered-count">
                <strong>{fastAnswers.filter((a) => a !== null).length}</strong> /{" "}
                {questions.length} javob
              </span>
            </div>
          </div>

          <button
            className={`back-to-top ${showBackToTop ? "" : "hidden-btt"}`}
            onClick={scrollToTop}
            aria-label="Tepaga qaytish"
          >
            ⬆ Tepaga qaytish
          </button>
        </div>
      )}

      {/* ═══════════════ SCORE ═══════════════ */}
      {section === "score" && (
        <div>
          <div className="score-section">
            <div className="score-card">
              <div className={`score-circle ${scoreClass}`}>
                <div>{score.pct}%</div>
                <div className="score-pct-label">ball</div>
              </div>
              <div className="score-title">{scoreTitle}</div>
              <div className="score-desc">{scoreDesc}</div>
              <div className="score-stats">
                <div className="stat-box correct-box">
                  <div className="stat-num">{score.correct}</div>
                  <div className="stat-label">✅ To&apos;g&apos;ri</div>
                </div>
                <div className="stat-box wrong-box">
                  <div className="stat-num">{score.wrong}</div>
                  <div className="stat-label">❌ Noto&apos;g&apos;ri</div>
                </div>
                <div className="stat-box skipped-box">
                  <div className="stat-num">{score.skipped}</div>
                  <div className="stat-label">⏭ O&apos;tkazilgan</div>
                </div>
                <div className="stat-box time-box">
                  <div className="stat-num">{formatTime(finalTime || seconds)}</div>
                  <div className="stat-label">⏱ Vaqt</div>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                {mode !== "fast" && (
                  <button className="btn btn-outline" onClick={reviewAnswers}>
                    👁 Javoblarni ko&apos;rish
                  </button>
                )}
                <button className="btn btn-primary" onClick={restartQuiz}>
                  🔄 Qayta boshlash
                </button>
                <button className="btn btn-outline" onClick={backToHome}>
                  🏠 Bosh sahifa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
