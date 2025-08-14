/* My Daily Coach - Frontend (no frameworks) */
/* Data is stored locally in localStorage. Your Gemini API key is kept locally, too. */

const MASTER_PROMPT = `You are *My Daily Coach*, an AI habit and micro-task generator. Your purpose is to deliver small, realistic, high-quality daily tasks that:
- Build compounding habits (PCB design, social skills, prayers, kindness, frustration control).
- Adapt to the user’s mood, energy, and recent performance.
- Fit into the user’s available time and context (mobile-friendly).
- Are specific, measurable, achievable, relevant, time-boxed (SMART).
- Encourage reflection and track streaks and compound progress.

User’s Focus Areas (initial)
- PCB designing (KiCad, footprints, layout, real-world practice).
- Social/extroversion (gentle, real interactions).
- Prayers (5 daily prayers checklist & consistency).
- Kindness (concrete acts of service).
- Frustration control (mood regulation & quick resets).

Behavior Rules
1. Daily Plan Size: Generate 5–10 tasks total, across the focus areas. Always include a short warm-up task and 1 quick win (<5 minutes).
2. Time & Difficulty: Each task must include: estimated minutes, difficulty (1–5), and context (home/outdoor/online).
3. Adaptation:
   - If yesterday’s completion ≥ 80% for 3+ days → gently increase difficulty for 1–2 tasks.
   - If completion ≤ 50% or mood below neutral → decrease difficulty and add 2 quick wins.
   - If “blocked” appears in notes → add an unblocking micro-step.
4. Compound Effect Framing: Briefly explain how today’s tasks compound toward weekly goals.
5. Prayer Discipline: Always include a 5-prayer checklist (Fajr, Dhuhr, Asr, Maghrib, Isha) with a consistency tip (no exact times).
6. Kindness: Include 1 small kindness task (specific, safe, culturally considerate).
7. Social: Include 1 social task with a concrete, low-pressure action (message, question prompt, or 2-minute chat).
8. Frustration Control: Include 1 mood/energy task (breathing drill, 2-minute reset, micro-walk, journaling).
9. Reflection: End the plan with 1 short reflection question the user can answer in one sentence.
10. Constraints & Safety: No tasks that require purchases, dangerous tools, medical claims, or sharing private data. Offer safe alternatives.
11. Output Format: Return valid JSON only (no markdown, no prose). Follow the schema exactly.

Task Quality Heuristics
- Prefer micro-tasks (5–20 min) that can be finished today.
- Make instructions concrete (what to do, how, and success criteria).
- PCB tasks should rotate: theory → schematic → footprints → layout → review → tiny project.
- Social tasks: specific opener lines, contexts (e.g., neighbor, shopkeeper, friend).
- Kindness tasks: one small tangible act (help, gratitude, cleanup, share knowledge).
- Frustration control: short, actionable protocols (e.g., “Box breathing 4-4-4-4 for 2 minutes, then note 1 thing you can control today.”)

INPUT format (send as the user content)
JSON with:
{
  "date": "YYYY-MM-DD",
  "goals": { "pcb": true, "social": true, "prayers": true, "kindness": true, "frustration_control": true },
  "preferences": {
    "max_daily_minutes": 90,
    "available_contexts": ["home","online","outdoor"],
    "difficulty_target": "easy|moderate|challenging",
    "language": "en"
  },
  "history": {
    "streak_days": 0, "longest_streak": 0,
    "last_7d_completion_rate": 0.0, "yesterday_completion_rate": 0.0,
    "recent_notes": "string"
  },
  "mood_today": { "valence": "low|neutral|high", "energy": "low|medium|high", "sleep_hours": 7 },
  "today_time_blocks": [ {"block": "morning","minutes": 0}, {"block":"afternoon","minutes":0}, {"block":"evening","minutes":0} ]
}

OUTPUT JSON SCHEMA (must follow exactly)
{
  "date": "YYYY-MM-DD",
  "summary": { "theme": "string", "compound_effect_note": "string", "total_estimated_minutes": 0 },
  "tasks": [{
      "id": "string-unique",
      "category": "pcb | social | prayers | kindness | frustration_control | warmup | quick_win",
      "title": "short actionable title",
      "why_it_matters": "1-2 lines connecting to long-term goals",
      "steps": ["clear step 1", "clear step 2", "clear step 3"],
      "success_criteria": "objective pass/fail description",
      "est_minutes": 0,
      "difficulty_1to5": 1,
      "context": "home | online | outdoor",
      "requires_materials": [],
      "streak_weight": 1,
      "points": 10,
      "notes_for_reflection": "1 question the user can answer in one sentence"
  }],
  "prayer_checklist": {
    "items": [
      {"name": "Fajr", "tip": "string"},
      {"name": "Dhuhr", "tip": "string"},
      {"name": "Asr", "tip": "string"},
      {"name": "Maghrib", "tip": "string"},
      {"name": "Isha", "tip": "string"}
    ],
    "consistency_tip": "one practical tip"
  },
  "adjustments": {
    "difficulty_change": "decrease | maintain | increase",
    "reason": "brief reason referencing history and mood"
  },
  "weekly_alignment": {
    "week_focus": ["up to 3 bullets of focus for this week"],
    "friday_review_prompt": "one-liner",
    "sunday_planning_prompt": "one-liner"
  }
}

Scoring & Streaks
- streak_weight: 1 for normal tasks, 2 if essential (e.g., prayer or mood reset).
- points: 5 (very easy), 10 (easy), 15 (moderate), 20 (hard).
- Always include at least one quick_win (≤5 minutes) and one warmup.
`;

// --- Simple state ---
const state = {
  plan: null,
  history: loadHistory(),  // { byDate: { 'YYYY-MM-DD': { completionRate, points, prayersDone }}, longestStreak }
};

// --- Helpers ---
function $ (sel, scope=document) { return scope.querySelector(sel); }
function $$ (sel, scope=document) { return Array.from(scope.querySelectorAll(sel)); }
function todayStr() { return new Date().toISOString().slice(0,10); }

function toast(msg) {
  alert(msg); // tiny
}

function loadKey() {
  return localStorage.getItem('gemini_key') || '';
}
function saveKey(k) {
  localStorage.setItem('gemini_key', k);
}

function loadHistory() {
  try {
    const raw = localStorage.getItem('mdc_history');
    if (!raw) return { byDate: {}, longestStreak: 0 };
    return JSON.parse(raw);
  } catch { return { byDate: {}, longestStreak: 0 }; }
}

function saveHistory() {
  localStorage.setItem('mdc_history', JSON.stringify(state.history));
}

function getLast7() {
  const dates = Object.keys(state.history.byDate).sort().slice(-7);
  return dates.map(d => ({ date: d, ...state.history.byDate[d] }));
}

function computeStreak() {
  const dates = Object.keys(state.history.byDate).sort();
  let streak = 0, maxStreak = state.history.longestStreak || 0;
  // Streak rule: a day counts if completionRate >= 0.6 OR prayersDone >= 4
  for (let i = dates.length - 1; i >= 0; i--) {
    const d = dates[i];
    const rec = state.history.byDate[d];
    if (rec && (rec.completionRate >= 0.6 || (rec.prayersDone||0) >= 4)) streak++;
    else break;
  }
  maxStreak = Math.max(maxStreak, streak);
  state.history.longestStreak = maxStreak;
  return { streak, maxStreak };
}

function summarizeRecent() {
  const last7 = getLast7();
  if (last7.length === 0) return { last7Rate: 0, yRate: 0, streak: 0, maxStreak: state.history.longestStreak||0 };
  const last7Rate = last7.reduce((a,b)=>a+(b.completionRate||0),0) / last7.length;
  const yRec = last7[last7.length-1]?.date === todayStr() ? last7[last7.length-2] : last7[last7.length-1];
  const yRate = yRec?.completionRate || 0;
  const st = computeStreak();
  return { last7Rate: +last7Rate.toFixed(2), yRate: +yRate.toFixed(2), streak: st.streak, maxStreak: st.maxStreak };
}

// --- Renderers ---
function renderSummary() {
  if (!state.plan) return;
  $('#todayDate').textContent = state.plan.date;
  $('#summaryTheme').textContent = state.plan.summary?.theme || '';
  $('#summaryCompound').textContent = state.plan.summary?.compound_effect_note || '';
  $('#summaryMinutes').textContent = state.plan.summary?.total_estimated_minutes ?? 0;
  const tasks = state.plan.tasks || [];
  $('#statTasks').textContent = tasks.length;
  $('#statDone').textContent = tasks.filter(t => !!state.history.byDate[state.plan.date]?.done?.[t.id]).length;
  $('#statPoints').textContent = state.history.byDate[state.plan.date]?.points || 0;
  $('#statStreak').textContent = computeStreak().streak;
  $('#summaryCard').hidden = false;
}

function renderTasks() {
  if (!state.plan) return;
  const parent = $('#tasksList');
  parent.innerHTML = '';
  const rec = (state.history.byDate[state.plan.date] ||= { done:{}, points:0, prayersDone:0, completionRate:0 });

  for (const task of state.plan.tasks) {
    const el = document.createElement('div');
    el.className = 'task';
    el.innerHTML = `
      <div class="title">${escapeHtml(task.title || '')}</div>
      <div class="meta">
        <span class="badge cat">${escapeHtml(task.category)}</span>
        <span class="badge ctx">${escapeHtml(task.context)}</span>
        <span class="badge diff">diff ${task.difficulty_1to5||1}</span>
        <span class="badge">${task.est_minutes||0} min</span>
        <span class="badge">+${task.points||0} pts</span>
      </div>
      <div class="why">${escapeHtml(task.why_it_matters||'')}</div>
      ${Array.isArray(task.steps) ? `<ol class="steps">${task.steps.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ol>`:''}
      <div class="success"><em>${escapeHtml(task.success_criteria||'')}</em></div>
      <div class="actions">
        <label class="complete">
          <input type="checkbox" class="toggle taskDone" data-task="${task.id}" ${rec.done?.[task.id]?'checked':''} />
          <span>Mark done</span>
        </label>
        <button class="small reflectionBtn" data-task="${task.id}">Reflection</button>
      </div>
      <div class="reflection" id="ref-${task.id}" hidden>
        <label>Notes for reflection
          <textarea rows="2" class="reflectionText" data-task="${task.id}" placeholder="${escapeHtml(task.notes_for_reflection||'Your one-line reflection')}"></textarea>
        </label>
      </div>
    `;
    parent.appendChild(el);
  }
  $('#tasksCard').hidden = false;

  parent.addEventListener('change', (e)=>{
    const cb = e.target.closest('.taskDone');
    if (!cb) return;
    const id = cb.dataset.task;
    rec.done[id] = cb.checked;
    rec.points = computePoints(state.plan.tasks, rec.done);
    rec.completionRate = computeCompletionRate(rec.done, state.plan.tasks.length);
    state.history.byDate[state.plan.date] = rec;
    saveHistory();
    renderSummary();
    drawChart();
    renderHistoryList();
  }, { once: true });

  parent.addEventListener('click', (e)=>{
    if (e.target.classList.contains('reflectionBtn')) {
      const id = e.target.dataset.task;
      const box = document.getElementById('ref-'+id);
      box.hidden = !box.hidden;
    }
  });
}

function computePoints(tasks, doneMap) {
  let pts = 0;
  for (const t of tasks) if (doneMap[t.id]) pts += (t.points||0);
  return pts;
}
function computeCompletionRate(doneMap, total) {
  const done = Object.values(doneMap).filter(Boolean).length;
  return total ? +(done/total).toFixed(2) : 0;
}

function renderPrayers() {
  if (!state.plan) return;
  const area = $('#prayersList');
  area.innerHTML = '';
  const items = state.plan.prayer_checklist?.items || [];
  $('#consistencyTip').textContent = state.plan.prayer_checklist?.consistency_tip || '';
  const rec = (state.history.byDate[state.plan.date] ||= { done:{}, points:0, prayersDone:0, completionRate:0 });

  items.forEach((p, idx) => {
    const id = `pr-${idx}`;
    const row = document.createElement('div');
    row.className = 'prayer-item';
    row.innerHTML = `
      <div><span class="name">${escapeHtml(p.name)}</span><div class="tip">${escapeHtml(p.tip||'')}</div></div>
      <label class="complete"><input type="checkbox" class="toggle prayerChk" data-name="${escapeHtml(p.name)}" /> Done</label>
    `;
    area.appendChild(row);
  });
  $('#prayersCard').hidden = false;

  area.addEventListener('change', ()=>{
    const count = $$('.prayerChk').filter(x=>x.checked).length;
    rec.prayersDone = count;
    state.history.byDate[state.plan.date] = rec;
    saveHistory();
    renderSummary();
  }, { once: true });
}

function renderWeekly() {
  if (!state.plan) return;
  const ul = $('#weekFocus');
  ul.innerHTML = '';
  (state.plan.weekly_alignment?.week_focus || []).forEach(f=>{
    const li = document.createElement('li'); li.textContent = f; ul.appendChild(li);
  });
  $('#fridayReview').textContent = state.plan.weekly_alignment?.friday_review_prompt || '';
  $('#sundayPlanning').textContent = state.plan.weekly_alignment?.sunday_planning_prompt || '';
  $('#weeklyCard').hidden = false;
}

function renderHistoryList() {
  const wrap = $('#historyList');
  wrap.innerHTML = '';
  const last7 = getLast7();
  last7.forEach(r=>{
    const div = document.createElement('div');
    div.className = 'row';
    div.style.justifyContent = 'space-between';
    div.innerHTML = `<span>${r.date}</span><span>✅ ${(r.completionRate*100)|0}% • ⭐ ${r.points||0} • 🕌 ${r.prayersDone||0}</span>`;
    wrap.appendChild(div);
  });
}

// simple SVG line chart
function drawChart() {
  const box = $('#chart');
  const last7 = getLast7();
  const w = box.clientWidth || 600, h = box.clientHeight || 120;
  const pad = 10;
  const pts = last7.map((r,i)=> ({
    x: pad + (i*(w-2*pad)/Math.max(1,last7.length-1)),
    y: h - pad - ((r.completionRate||0)* (h-2*pad))
  }));
  const path = pts.map((p,i)=> (i?'L':'M')+p.x+','+p.y).join(' ');
  box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path d="${path}" fill="none" stroke="white" stroke-width="2" />
  </svg>`;
}

function escapeHtml(s){
  return (s||'').toString().replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m]));
}

// --- Build INPUT JSON from UI + history ---
function buildInput() {
  const date = todayStr();
  const contexts = $$('.ctx').filter(c=>c.checked).map(c=>c.value);
  const hsum = summarizeRecent();
  const input = {
    date,
    goals: { pcb:true, social:true, prayers:true, kindness:true, frustration_control:true },
    preferences: {
      max_daily_minutes: +$('#maxMinutes').value || 90,
      available_contexts: contexts.length?contexts:['home','online','outdoor'],
      difficulty_target: $('#difficulty').value,
      language: 'en'
    },
    history: {
      streak_days: hsum.streak,
      longest_streak: hsum.maxStreak,
      last_7d_completion_rate: hsum.last7Rate,
      yesterday_completion_rate: hsum.yRate,
      recent_notes: $('#notes').value || ''
    },
    mood_today: {
      valence: $('#moodValence').value,
      energy: $('#moodEnergy').value,
      sleep_hours: +$('#sleepHours').value || 7
    },
    today_time_blocks: [
      { block:'morning', minutes: +$('#mornMin').value || 0 },
      { block:'afternoon', minutes: +$('#aftMin').value || 0 },
      { block:'evening', minutes: +$('#eveMin').value || 0 }
    ]
  };
  return input;
}

// --- Gemini call ---
async function callGemini(input) {
  const key = loadKey();
  if (!key) throw new Error('AIzaSyB_3X5j_a0T2NszhiKEPdpM-srnHFlOong');

  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=' + encodeURIComponent(key);
  const body = {
    systemInstruction: { role: 'system', parts: [{ text: MASTER_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
    generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Gemini error: ' + res.status + ' ' + errText);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No content returned.');
  let json;
  try { json = JSON.parse(text); }
  catch(e){ throw new Error('Model did not return valid JSON. Raw:\n' + text.slice(0,2000)); }
  return json;
}

// --- Wire UI ---
window.addEventListener('DOMContentLoaded', ()=>{
  // load saved key
  $('#apiKey').value = loadKey();

  $('#saveKeyBtn').addEventListener('click', ()=>{
    const k = $('#apiKey').value.trim();
    if (!/^AI|AIza/.test(k)) {
      if (!confirm('The key does not look like a Gemini key. Save anyway?')) return;
    }
    saveKey(k);
    toast('API key saved locally.');
  });

  $('#generateBtn').addEventListener('click', async ()=>{
    try {
      const input = buildInput();
      const plan = await callGemini(input);
      state.plan = plan;

      // Initialize day record
      state.history.byDate[plan.date] ||= { done:{}, points:0, prayersDone:0, completionRate:0 };
      saveHistory();

      renderSummary();
      renderTasks();
      renderPrayers();
      renderWeekly();
      drawChart();
      renderHistoryList();
      $('#summaryCard').hidden = false;
    } catch (e) {
      console.error(e);
      toast(e.message);
    }
  });

  $('#exportBtn').addEventListener('click', ()=>{
    if (!state.plan) return toast('No plan to export.');
    const blob = new Blob([JSON.stringify(state.plan, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plan-${state.plan.date}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#resetBtn').addEventListener('click', ()=>{
    if (!confirm('Clear today’s data?')) return;
    const d = todayStr();
    delete state.history.byDate[d];
    saveHistory();
    $('#summaryCard').hidden = true;
    $('#tasksCard').hidden = true;
    $('#prayersCard').hidden = true;
    $('#weeklyCard').hidden = true;
  });

  // Initial chart/history
  drawChart();
  renderHistoryList();
});
