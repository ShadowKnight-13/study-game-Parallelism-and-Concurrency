const scenarios = [
  {
    id: 'threads', icon: '⌁', codeFile: 'inventory_worker.py', title: 'Inventory Sync', operation: 'OPERATION 01 / I-O LINE', difficulty: 'TRAINING',
    brief: 'The order desk is waiting on supplier responses. Five workers are supposed to update the shared inventory count, but the final total is wrong. Find the coordination fault before the next shipment leaves.',
    code: ['from concurrent.futures import ThreadPoolExecutor', 'inventory = 0', '', 'def receive_order(quantity):', '    global inventory', '    current = inventory', '    # another worker can run here', '    inventory = current + quantity', '', 'with ThreadPoolExecutor(max_workers=5) as pool:', '    pool.map(receive_order, [2, 4, 1, 3, 5])'],
    choices: [
      {code: 'Add a Lock around the read + write', detail: 'Make the critical section atomic.', correct: true},
      {code: 'Use more threads', detail: 'More workers will fix the total.', correct: false},
      {code: 'Replace ThreadPoolExecutor with asyncio', detail: 'Async automatically protects shared state.', correct: false},
      {code: 'Remove the global keyword', detail: 'Local variables are shared safely.', correct: false}
    ],
    explanation: '<strong>Patch accepted: protect the critical section.</strong> A thread can be interrupted between reading and writing <code>inventory</code>. Use <code>threading.Lock()</code> and acquire it around both operations, or return values from workers and combine them in one place. Threads help with I/O waiting, but they do not make shared state safe automatically.',
    telemetry: ['5 workers', 'I/O wait', 'race condition', 'LOCK REQUIRED']
  },
  {
    id: 'processes', icon: '▦', codeFile: 'image_forge.py', title: 'Image Forge', operation: 'OPERATION 02 / CPU LINE', difficulty: 'FIELD TEST',
    brief: 'The forge must resize 24 high-resolution images. The current threaded line barely uses the CPU and misses its delivery window. Select the execution model that can perform real CPU work in parallel.',
    code: ['from concurrent.futures import ThreadPoolExecutor', '', 'def render(image):', '    return expensive_pixel_math(image)', '', 'with ThreadPoolExecutor(max_workers=8) as pool:', '    finished = list(pool.map(render, images))'],
    choices: [
      {code: 'Use ProcessPoolExecutor', detail: 'Separate processes can use multiple CPU cores.', correct: true},
      {code: 'Use one more ThreadPoolExecutor', detail: 'Threads bypass the GIL for CPU work.', correct: false},
      {code: 'Add await before render(image)', detail: 'await makes calculations parallel.', correct: false},
      {code: 'Run the loop eight times', detail: 'Repeated loops create workers.', correct: false}
    ],
    explanation: '<strong>Patch accepted: move CPU work into processes.</strong> CPython’s GIL prevents multiple threads from executing Python bytecode at the same time. <code>ProcessPoolExecutor</code> gives each worker its own interpreter, allowing CPU-bound work to run in parallel. The tradeoff is process startup and data-transfer overhead.',
    telemetry: ['24 images', 'CPU bound', 'GIL bottleneck', 'PROCESSES']
  },
  {
    id: 'asyncio', icon: '≈', codeFile: 'dispatch_center.py', title: 'Dispatch Center', operation: 'OPERATION 03 / NETWORK LINE', difficulty: 'ADVANCED',
    brief: 'The dispatch center must check six remote stations. Each request spends most of its time waiting on the network. Repair the coroutine launch so the requests overlap instead of queueing one by one.',
    code: ['import asyncio', '', 'async def check_station(station):', '    await network_ping(station)', '    return station.status', '', 'async def check_all(stations):', '    results = []', '    for station in stations:', '        results.append(check_station(station))', '    return results'],
    choices: [
      {code: 'Use await asyncio.gather(*tasks)', detail: 'Schedule the coroutines together.', correct: true},
      {code: 'Add time.sleep(1) inside the loop', detail: 'A pause creates concurrency.', correct: false},
      {code: 'Call asyncio.run for every station', detail: 'One event loop per request is faster.', correct: false},
      {code: 'Remove async from check_station', detail: 'Regular functions can await.', correct: false}
    ],
    explanation: '<strong>Patch accepted: gather the coroutines.</strong> Calling an async function creates a coroutine object; it does not run it. Build a task list and use <code>await asyncio.gather(*tasks)</code> to let the event loop switch while each request waits. This is concurrency, not CPU parallelism.',
    telemetry: ['6 stations', 'network wait', 'coroutines', 'GATHER TASKS']
  }
];

let active = 0;
let selected = null;
let solved = new Set();
let streak = 0;
let xp = 0;

const $ = (id) => document.getElementById(id);

function renderScenarioList() {
  $('scenario-list').innerHTML = scenarios.map((s, index) => `
    <button class="scenario-button ${index === active ? 'active' : ''}" data-index="${index}" type="button">
      <span class="scenario-top"><span class="scenario-icon">${s.icon}</span>${s.operation}</span>
      <strong>${s.title}</strong><small>${s.id === 'threads' ? 'Shared state + locks' : s.id === 'processes' ? 'CPU work + the GIL' : 'Coroutines + waiting'}</small>
    </button>`).join('');
  document.querySelectorAll('.scenario-button').forEach((button) => button.addEventListener('click', () => {
    active = Number(button.dataset.index); selected = null; render();
  }));
}

function codeMarkup(lines) {
  return lines.map((line, i) => `<span class="code-line"><span class="line-number">${String(i + 1).padStart(2, '0')}</span>${highlight(line)}</span>`).join('');
}

function highlight(line) {
  let safe = line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  safe = safe.replace(/(#.*)$/g, '<span class="syntax-comment">$1</span>');
  safe = safe.replace(/\b(from|import|as|def|global|with|in|return)\b/g, '<span class="syntax-key">$1</span>');
  safe = safe.replace(/\b(ThreadPoolExecutor|ProcessPoolExecutor|pool\.map|asyncio|network_ping)\b/g, '<span class="syntax-fn">$1</span>');
  safe = safe.replace(/(\[[^\]]*\])/g, '<span class="syntax-string">$1</span>');
  return safe;
}

function renderTelemetry(items) {
  $('telemetry').innerHTML = items.map((item, i) => `<div class="telemetry-cell ${i === 3 ? 'good' : ''}"><span>${['QUEUE', 'WORK PROFILE', 'FAULT SIGNAL', 'TARGET PATCH'][i]}</span><strong>${item}</strong></div>`).join('');
}

function render() {
  const s = scenarios[active];
  renderScenarioList();
  $('scenario-kicker').textContent = s.operation;
  $('scenario-title').textContent = s.title;
  $('difficulty-label').textContent = s.difficulty;
  $('mission-icon').textContent = s.icon;
  $('mission-text').textContent = s.brief;
  $('file-label').textContent = s.codeFile;
  $('code-block').innerHTML = codeMarkup(s.code);
  renderTelemetry(s.telemetry);
  $('telemetry-label').textContent = solved.has(s.id) ? 'PATCH VERIFIED' : 'FAULT ACTIVE';
  $('choices').innerHTML = s.choices.map((choice, i) => `<button class="choice ${selected === i ? 'selected' : ''}" data-choice="${i}" type="button"><code>${choice.code}</code><small>${choice.detail}</small></button>`).join('');
  document.querySelectorAll('.choice').forEach((button) => button.addEventListener('click', () => { selected = Number(button.dataset.choice); render(); }));
  $('run-button').disabled = selected === null;
  $('run-button').style.opacity = selected === null ? '.55' : '1';
  $('feedback').className = 'feedback hidden';
  $('feedback').innerHTML = '';
  $('solved-count').textContent = solved.size;
  $('streak-count').textContent = streak;
  $('score-label').textContent = `${xp} XP`;
}

$('run-button').addEventListener('click', () => {
  if (selected === null) return;
  const s = scenarios[active];
  const good = s.choices[selected].correct;
  const feedback = $('feedback');
  feedback.className = `feedback ${good ? 'success' : 'error'}`;
  if (good) {
    if (!solved.has(s.id)) { solved.add(s.id); xp += 100; }
    streak += 1;
    feedback.innerHTML = s.explanation;
    $('telemetry-label').textContent = 'PATCH VERIFIED';
    $('telemetry-label').style.color = '#4caa72';
  } else {
    streak = 0;
    feedback.innerHTML = '<strong>Patch rejected: the line still has a fault.</strong> Watch the symptom and ask what the worker is waiting on—or what state it shares. Try another repair and run the line again.';
  }
  $('solved-count').textContent = solved.size;
  $('streak-count').textContent = streak;
  $('score-label').textContent = `${xp} XP`;
  $('run-button').disabled = true;
  $('run-button').style.opacity = '.55';
  document.querySelectorAll('.choice').forEach((button, i) => {
    button.disabled = true;
    if (s.choices[i].correct) button.classList.add('correct');
    if (i === selected && !good) button.classList.add('wrong');
  });
});

render();

