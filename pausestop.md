---
name: Pause Stop and Report UI
overview: תוכנית ויזואלית לאופן שבו ייראו פאוז/סטופ והדוח המשודרג (Planned vs Actual) לפי הספק.
todos: []
isProject: false
---

# איך זה ייראה – Pause/Stop + Report Upgrade

## 1. מצב Pause – Overlay על המסך

זה אמור להיות בתוך הפאואפ של האקסטשיין-
כשהמשתמש לוחץ **Pause**:

```
┌─────────────────────────────────────────┐
│  Session Paused                         │
│                                         │
│  All work content is hidden.            │
│  No undocumented work possible.         │
│                                         │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │   Resume    │  │  Stop Session   │   │
│  └─────────────┘  └─────────────────┘   │
└─────────────────────────────────────────┘
```

- **המסך:** רק ה-overlay הזה – אין טיימר, אין תוכן עבודה
- **כפתורים:** Resume (מחזיר את הבלוק) | Stop Session ( סיום מיידי שמוביל לדוח)
- **מיקום:** כמו ה-overlay הנוכחי (פינה ימנית עליונה, או fullscreen overlay)

---

## 2. בלוק עם Pause – איך הוא מוצג בדוח

בלוק אחד שכלל הפסקה יוצג כ-**3 חלקים**:

```
┌─ Block 1 · WORK · Deep work ─────────────────────────────┐
│                                                           │
│  BEFORE PAUSE                                             │
│  09:00:00 → 09:12:30   (12.5 min)                        │
│  Reflection: "Focused on intro..."                        │
│                                                           │
├───────────────────────────────────────────────────────────┤
│  PAUSE                                                    │
│  09:12:30 → 09:18:45   (6.25 min)                        │
│  Topic: Pause                                             │
│  (no reflection)                                          │
│                                                           │
├───────────────────────────────────────────────────────────┤
│  AFTER PAUSE                                              │
│  09:18:45 → 09:25:00   (6.25 min)                        │
│  Reflection: "Continued with main section..."            │
└───────────────────────────────────────────────────────────┘
```

- **Before Pause:** החלק המקורי עד ל-Pause, עם זמנים ו-reflection
- **Pause:** אירוע נפרד, topic="Pause", זמנים מדויקים, ללא reflection
- **After Pause:** המשך הבלוק המקורי, עם זמנים ו-reflection

---

## 3. Stop Session – "Ended Early"

לחיצה על **Stop**:

- מעבר מיידי לדף הדוח
- הדוח מציג את כל מה שנאסף עד לרגע העצירה
- Chip/תווית: **"Ended Early"** (לא "Failed")
- אין בלוקים חדשים אחרי העצירה

---

## 4. דוח Planned vs Actual – ללא גריד

מבנה טבלאי רך, בלי קווים נוקשים:

```
Block 1 · WORK · Deep work
────────────────────────────────────────────────────────────
  Planned            Actual              Delta
  25 min             12.5 + 6.25 + 6.25  (matches, with pause)
  09:00–09:25        09:00–09:25         —


  Reflection: "Focused on intro. Paused for 6 min. Continued..."
────────────────────────────────────────────────────────────


Block 2 · BREAK
────────────────────────────────────────────────────────────
  Planned            Actual              Delta
  5 min              5 min               —
  09:25–09:30        09:25–09:30         —


  (no reflection for break)
────────────────────────────────────────────────────────────
```

- **Planned:** דקות + טווח זמן מתוכנן
- **Actual:** דקות + טווח זמן בפועל (כולל pause אם יש)
- **Delta:** הפרש (או "—" אם תואם)
- **מראה:** רווחים, רקעים עדינים, ללא borders נוקשים – יותר card-like

---

## 5. מבנה נתונים נדרש

### ReportBlock מורחב (להפסקות)

```typescript
type ReportBlock =
  | { type: "normal"; ... }           // בלוק רגיל
  | { type: "paused"; parts: [        // בלוק עם pause
      { segment: "before"; startedAt; endedAt; reflection? },
      { segment: "pause"; startedAt; endedAt },
      { segment: "after"; startedAt; endedAt; reflection? }
    ] }
```

### SessionReport מורחב

```typescript
type SessionReport = {
  ...
  endedEarly?: boolean;  // true אם Stop (לא Completed)
}
```

---

## 6. סיכום ויזואלי

| מצב                     | מה מוצג                                   |
| ----------------------- | ----------------------------------------- | ------ | ------------------ |
| **Running**             | Overlay: טיימר + Pause + Stop             |
| **Paused**              | Overlay: רק Resume + Stop, ללא תוכן עבודה |
| **Stop**                | מעבר לדוח עם "Ended Early"                |
| **דוח – בלוק רגיל**     | Planned                                   | Actual | Delta + Reflection |
| **דוח – בלוק עם pause** | 3 שורות: Before / Pause / After           |
