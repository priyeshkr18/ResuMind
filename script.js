(() => {
	'use strict';

	/* ---------- Configuration ----------
		 Leave endpoint empty to run in demo mode (no AI, rule-based sample logic).
		 To connect a real backend, set it to your server URL, for example 'http://localhost:3000'.
		 Expected routes (POST, JSON):
			 /questions -> { questions: [{ q, hint, topic }] }  receives { resume, analysis, focus, level }
			 /feedback  -> { well:[], improve:[], missing:[], structure:'', tip:'' }  receives { question, answer, focus, level }
		 Keep API keys on the server. Never place them in this file. */
	const API_CONFIG = { endpoint: '' };
	const MAX_BYTES = 5 * 1024 * 1024;
	const FOCUS = [
		['general', 'General HR interview'], ['technical', 'Technical interview'],
		['project', 'Project-based interview'], ['behavioral', 'Behavioral interview'],
		['internship', 'Internship interview'], ['deep', 'Resume deep dive']
	];
	const LEVELS = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']];
	const SAMPLE = `Summary
Final-year computer science student interested in application security.

Skills
Python, JavaScript, SQL, Burp Suite, Linux, Git

Projects
Web Vulnerability Scanner - crawler and scanner for common OWASP issues
Campus Notes App - Flask app with login and file sharing

Achievements
Finished second in a college capture-the-flag event
Completed a CompTIA Security+ study course

Education
B.Tech in Computer Science, 2022-2026

Experience
Security Intern - tested a small web portal and wrote a findings report`;

	/* ---------- Helpers ---------- */
	const $ = id => document.getElementById(id);
	const el = (tag, attrs = {}, kids = []) => {
		const n = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs)) k === 'text' ? (n.textContent = v) : n.setAttribute(k, v);
		[].concat(kids).forEach(c => n.append(c));
		return n;
	};
	const sleep = ms => new Promise(r => setTimeout(r, ms));
	const show = (node, on = true) => { node.hidden = !on; };
	const showErr = (node, msg) => { node.textContent = msg || ''; show(node, !!msg); };
	let toastTimer;
	function toast(msg) {
		const t = $('toast'); t.textContent = msg; t.classList.add('show');
		clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
	}
	const list = (items, empty) => items.length
		? el('ul', {}, items.map(i => el('li', { text: i })))
		: el('p', { class: 'empty', text: empty });
	const scrollTo = node => node.scrollIntoView({ behavior: 'smooth', block: 'start' });

	/* ---------- Theme ---------- */
	const ICON_MOON = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M16 12.2A7 7 0 0 1 7.8 4 7 7 0 1 0 16 12.2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
	const ICON_SUN = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M4.5 15.5l1.4-1.4M14.1 5.9l1.4-1.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
	function applyTheme(theme) {
		document.documentElement.dataset.theme = theme;
		const btn = $('themeBtn');
		btn.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
		btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
	}
	function initTheme() {
		let saved = null;
		try { saved = localStorage.getItem('resumind-theme'); } catch (e) { /* storage unavailable */ }
		applyTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
		$('themeBtn').addEventListener('click', () => {
			const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
			applyTheme(next);
			try { localStorage.setItem('resumind-theme', next); } catch (e) { /* ignore */ }
		});
	}

	/* ---------- Mobile menu ---------- */
	function initMenu() {
		const btn = $('menuBtn'), menu = $('menu');
		const set = open => { menu.classList.toggle('open', open); btn.setAttribute('aria-expanded', open); btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); };
		btn.addEventListener('click', () => set(!menu.classList.contains('open')));
		menu.addEventListener('click', e => { if (e.target.tagName === 'A') set(false); });
		document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
	}

	/* ---------- File upload ---------- */
	function handleFile(file) {
		showErr($('fileErr'), '');
		if (!file) return;
		const ext = file.name.split('.').pop().toLowerCase();
		if (!['pdf', 'docx'].includes(ext)) return showErr($('fileErr'), 'This file type is not supported. Choose a PDF or DOCX file.');
		if (file.size > MAX_BYTES) return showErr($('fileErr'), 'This file is larger than 5 MB. Choose a smaller file.');
		if (file.size === 0) return showErr($('fileErr'), 'This file is empty. Choose another file.');
		$('fName').textContent = file.name;
		$('fInfo').textContent = `${ext.toUpperCase()} - ${(file.size / 1024).toFixed(file.size > 1048576 ? 0 : 1)} KB - selected, not read`;
		show($('fileChip'));
		toast('File selected. Paste its text on the right to analyze it.');
	}
	function clearFile() {
		$('fileInput').value = ''; show($('fileChip'), false); showErr($('fileErr'), '');
	}
	function initUpload() {
		const drop = $('drop'), input = $('fileInput');
		drop.addEventListener('click', () => input.click());
		drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
		input.addEventListener('change', () => handleFile(input.files[0]));
		['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
		['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
		drop.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));
		$('replaceBtn').addEventListener('click', () => input.click());
		$('removeBtn').addEventListener('click', clearFile);
		$('sampleBtn').addEventListener('click', () => { $('resumeText').value = SAMPLE; showErr($('textErr'), ''); toast('Sample resume inserted. It is fictional.'); });
	}

	/* ---------- Resume analysis (demo: keyword rules, no AI) ---------- */
	const HEADS = {
		summary: /^(professional\s+)?(summary|objective|profile|about( me)?)$/i,
		skills: /^((technical|soft|key|core)\s+)?(skills|technologies|tools)$/i,
		projects: /^((academic|personal|key)\s+)?projects?$/i,
		achievements: /^(achievements?|awards|certifications?|accomplishments|honou?rs)$/i,
		education: /^education$/i,
		experience: /^((work|professional)\s+)?(experience|employment|internships?)$/i
	};
	function analyze(text) {
		const out = { summary: [], skills: [], projects: [], achievements: [], education: [], experience: [] };
		let cur = null;
		for (const raw of text.split(/\r?\n/)) {
			const line = raw.trim();
			if (!line) continue;
			const idx = line.indexOf(':');
			const head = (idx > -1 ? line.slice(0, idx) : line).trim();
			const key = head.length < 40 && Object.keys(HEADS).find(k => HEADS[k].test(head));
			if (key) {
				cur = key;
				const rest = idx > -1 ? line.slice(idx + 1).trim() : '';
				if (rest) out[key].push(rest);
			} else if (cur) {
				out[cur].push(line.replace(/^[-*\u2022\u00b7]\s*/, ''));
			}
		}
		const skills = [...new Set(out.skills.flatMap(l => l.replace(/^[^,;|]{0,25}:\s*/, '').split(/[,;|\u2022\u00b7]/)).map(s => s.trim()).filter(s => s && s.length < 40))].slice(0, 14);
		const projLines = out.projects.filter(l => l.length <= 90 && !/\.$/.test(l));
		const projects = (projLines.length ? projLines : out.projects).map(l => l.split(/\s[-\u2013|]\s|:\s|\(/)[0].trim().slice(0, 60)).slice(0, 4);
		const areas = [];
		const missing = { summary: 'Summary', skills: 'Skills', projects: 'Projects', education: 'Education', experience: 'Experience' };
		for (const k in missing) if (!out[k].length) areas.push(`No "${missing[k]}" section was found. Add a heading if it exists.`);
		if (out.experience.length + out.projects.length && !/\d/.test(out.experience.concat(out.projects).join(' '))) areas.push('No numbers were found in experience or projects. Interviewers often ask about measurable results.');
		if (skills.length && skills.length < 3) areas.push('Few skills were detected. List the tools you can discuss in depth.');
		return { ...out, skills, projects, areas };
	}
	const ICONS = ['M4 4h8v8H4z', 'M3 8h10M8 3v10', 'M4 12l8-8M4 4h8v8', 'M8 2l5 3v6l-5 3-5-3V5z', 'M2 13V6l6-4 6 4v7z', 'M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3z'];
	function renderAnalysis(a) {
		const defs = [
			['Professional summary', a.summary, 'No summary found.'],
			['Technical and soft skills', a.skills, 'No skills found.'],
			['Projects and achievements', a.projects.concat(a.achievements), 'No projects or achievements found.'],
			['Education', a.education, 'No education found.'],
			['Work experience', a.experience, 'No experience found.'],
			['Areas to explore', a.areas, 'No gaps detected by the rules. That does not mean none exist.']
		];
		const box = $('cards'); box.replaceChildren();
		defs.forEach(([title, items, empty], i) => {
			const icon = el('span', { 'aria-hidden': 'true' });
			icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 16 16"><path d="${ICONS[i]}" fill="none" stroke="var(--accent-deep)" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
			box.append(el('div', { class: 'card' }, [el('h3', {}, [icon, title]), list(items.slice(0, 6), empty)]));
		});
	}

	/* ---------- Question generation (demo templates) ---------- */
	function buildDemoQuestions(a, focus, level) {
		const s = i => a.skills[i] || null, p = i => a.projects[i] || null;
		const role = (a.experience[0] || '').split(/\s[-\u2013]\s/)[0].slice(0, 60) || null;
		const Q = (q, hint, topic) => ({ q, hint, topic });
		const bank = {
			general: [
				Q('Walk me through your background in about two minutes.', 'Cover present, past, then what you want next.', 'Introduction'),
				Q('What kind of role are you looking for, and why?', 'Tie your answer to something real you have done.', 'Career goals'),
				Q(s(0) ? `What first drew you to ${s(0)}?` : 'What first drew you to your field?', 'Describe a specific moment, not a general interest.', s(0) || 'Motivation'),
				Q('What are your strengths, and what are you actively improving?', 'Give one example for each.', 'Self-awareness'),
				Q('Where would you like to be in three years?', 'Keep it honest and linked to learning.', 'Goals'),
				Q('Why should we consider you for this role?', 'Pick two strengths and back each with evidence.', 'Fit')
			],
			technical: [
				Q(s(0) ? `Explain how you have used ${s(0)} in practice.` : 'Pick a technical skill you know well and explain how you used it.', 'Name a concrete task and the outcome.', s(0) || 'Core skill'),
				Q(s(1) ? `What common mistakes do people make with ${s(1)}?` : 'What common mistakes do beginners make in your main skill area?', 'Say how you would avoid each one.', s(1) || 'Common mistakes'),
				Q(s(0) ? `How would you debug a problem in ${s(0)}?` : 'How do you approach debugging a problem you have not seen before?', 'Describe steps in order.', s(0) || 'Debugging'),
				Q(s(0) && s(1) ? `How do ${s(0)} and ${s(1)} differ, and when would you pick each?` : 'Compare two tools you know and say when you would pick each.', 'Use trade-offs, not definitions.', s(1) || 'Trade-offs'),
				Q(s(2) ? `Which part of ${s(2)} do you find hardest to explain?` : 'Which concept do you find hardest to explain?', 'Try explaining it to a beginner.', s(2) || 'Explaining concepts'),
				Q('How do you keep your technical knowledge current?', 'Mention specific sources or practice.', 'Learning')
			],
			project: [
				Q(p(0) ? `Tell me about ${p(0)}. What problem did it solve?` : 'Tell me about a project you are proud of. What problem did it solve?', 'State the goal and your role first.', p(0) || 'Project overview'),
				Q(p(0) ? `What was the architecture of ${p(0)}, and which tools did you choose?` : 'Describe the architecture of one of your projects.', 'Explain why you picked each tool.', p(0) || 'Architecture'),
				Q(p(0) ? `What was the hardest challenge in ${p(0)}, and how did you solve it?` : 'What was the hardest challenge in a project, and how did you solve it?', 'Describe the cause, your fix, and the result.', p(0) || 'Challenges'),
				Q(p(1) ? `What were the limitations of ${p(1)}?` : 'What were the limitations of your most recent project?', 'Honest limits show good judgment.', p(1) || 'Limitations'),
				Q(p(0) ? `How did you test ${p(0)}?` : 'How did you test your project?', 'Mention what you checked and what you did not.', p(0) || 'Testing'),
				Q('If you started a project again, what would you change?', 'Pick one technical and one process change.', 'Reflection')
			],
			behavioral: [
				Q('Tell me about a time you faced a difficult challenge.', 'Use Situation, Task, Action, Result.', 'Challenge'),
				Q(role ? `Tell me about a time during your work as "${role}" when something did not go as planned.` : 'Tell me about a time something did not go as planned.', 'Focus on what you did next.', role || 'Setbacks'),
				Q('Describe a time you disagreed with a teammate. What happened?', 'Show how you listened and reached a decision.', 'Teamwork'),
				Q('Tell me about a time you had to learn something quickly.', 'Describe how you learned and how you applied it.', 'Learning'),
				Q('Describe a time you received critical feedback.', 'Say what you changed afterwards.', 'Feedback'),
				Q('Tell me about a deadline you were at risk of missing.', 'Explain how you prioritized.', 'Time management')
			],
			internship: [
				Q('Why are you applying for an internship in this field?', 'Link your studies to what you want to practice.', 'Motivation'),
				Q('What do you hope to learn during an internship?', 'Be specific about skills and tasks.', 'Learning goals'),
				Q(p(0) ? `How would your work on ${p(0)} help you in an internship?` : 'How would your academic work help you in an internship?', 'Name a skill that transfers.', p(0) || 'Transferable skills'),
				Q('How do you handle a task you have never done before?', 'Describe where you look first and when you ask for help.', 'Learning approach'),
				Q(s(0) ? `Describe a task where you used ${s(0)}.` : 'Describe a task where you used your strongest skill.', 'Give the context and result.', s(0) || 'Skills'),
				Q('How do you manage coursework and an internship together?', 'Talk about planning, not just effort.', 'Time management')
			],
			deep: [
				Q(p(0) ? `Your resume lists ${p(0)}. What was your own contribution?` : 'Pick a project on your resume. What was your own contribution?', 'Separate what you did from what the team did.', p(0) || 'Contribution'),
				Q(s(0) ? `Your skills include ${s(0)}. Show me where you have used it.` : 'Pick a listed skill and show where you have used it.', 'Give a specific example.', s(0) || 'Skill evidence'),
				Q(a.achievements[0] ? `You list "${a.achievements[0].slice(0, 70)}". What did it take to get there?` : 'Which achievement on your resume took the most effort?', 'Describe the effort and what you learned.', 'Achievements'),
				Q(a.education[0] ? `How has your education ("${a.education[0].slice(0, 60)}") prepared you for this work?` : 'How has your education prepared you for this work?', 'Link a course or assignment to a real task.', 'Education'),
				Q(s(s(3) ? 3 : 0) ? `Which skill on your resume are you least confident about, and why is it listed?` : 'Which skill on your resume are you least confident about?', 'Honesty is better than overclaiming.', 'Skill gaps'),
				Q('What is missing from your resume that you would add?', 'Think of results, links, or recent work.', 'Resume gaps')
			]
		};
		const suffix = { beginner: ' Keep it simple and focus on the basics.', intermediate: '', advanced: ' Go deeper into trade-offs and edge cases.' }[level];
		return bank[focus].map(x => ({ ...x, q: x.q + suffix }));
	}

	/* ---------- API layer: demo or real backend ---------- */
	async function callBackend(path, payload) {
		const r = await fetch(API_CONFIG.endpoint + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
		if (!r.ok) throw new Error('The server returned status ' + r.status);
		return r.json();
	}
	async function getQuestions(text, a, focus, level) {
		if (API_CONFIG.endpoint) return (await callBackend('/questions', { resume: text, analysis: a, focus, level })).questions;
		await sleep(500);
		return buildDemoQuestions(a, focus, level);
	}
	function demoFeedback(answer, item, focus) {
		const words = answer.trim().split(/\s+/).filter(Boolean).length;
		const hasNum = /\d/.test(answer);
		const reasoning = /(because|so that|therefore|as a result|which meant)/i.test(answer);
		const wellL = [], improve = [], missing = [];
		if (words >= 60) wellL.push('The answer has enough length to carry a real explanation.');
		if (hasNum) wellL.push('It includes at least one number or measurable detail.');
		if (reasoning) wellL.push('It gives reasons, not only statements.');
		if (!wellL.length) wellL.push('You gave an answer. Add detail and it will be easier to assess.');
		if (words < 40) improve.push('The answer is short. Aim for roughly 60 to 150 words.');
		if (!hasNum) { improve.push('Add a number, such as time saved, users, or issues found.'); missing.push('A measurable result'); }
		if (!reasoning) missing.push('The reason behind your decisions');
		if (item.topic && !answer.toLowerCase().includes(item.topic.toLowerCase().split(' ')[0])) missing.push(`A direct mention of "${item.topic}"`);
		if (!improve.length) improve.push('Check that each claim has an example behind it.');
		const structure = {
			behavioral: 'Situation, Task, Action, Result, then one lesson.',
			project: 'Goal, your role, design choices, a challenge, the result, what you would change.',
			technical: 'Short definition, how you used it, a trade-off, a concrete example.'
		}[focus] || 'Main point, reason, example, link back to the role.';
		const tip = words < 40 ? 'Write two more sentences: one example and one result.' : 'Read your answer aloud and cut any sentence that adds no new information.';
		return { well: wellL, improve, missing: missing.length ? missing : ['Nothing obvious found by the rules.'], structure, tip, simulated: true, short: words < 40 };
	}
	async function getFeedback(answer, item, focus, level) {
		if (API_CONFIG.endpoint) return { ...(await callBackend('/feedback', { question: item.q, answer, focus, level })), simulated: false };
		await sleep(800);
		return demoFeedback(answer, item, focus);
	}

	/* ---------- Interview session ---------- */
	const S = { analysis: null, text: '', focus: 'general', level: 'intermediate', qs: [], i: 0, log: [], busy: false };

	function renderOpts(box, name, opts, def) {
		opts.forEach(([v, label]) => {
			const input = el('input', { type: 'radio', name, value: v });
			if (v === def) input.checked = true;
			box.append(el('label', {}, [input, el('span', { text: label })]));
		});
	}
	const picked = name => document.querySelector(`input[name="${name}"]:checked`).value;
	const labelOf = (opts, v) => (opts.find(o => o[0] === v) || [])[1];

	function setBusy(b) {
		S.busy = b;
		['submitBtn', 'skipBtn', 'hintBtn'].forEach(id => { $(id).disabled = b; });
		show($('typing'), b);
	}
	function renderNav() {
		const nav = $('qNav'); nav.replaceChildren();
		S.qs.forEach((_, i) => {
			const entry = S.log[i];
			const cls = i === S.i ? 'now' : entry ? (entry.skipped ? 'done skipped' : 'done') : '';
			const li = el('li', { class: cls, text: String(i + 1) });
			if (i === S.i) li.setAttribute('aria-current', 'step');
			li.setAttribute('aria-label', `Question ${i + 1}${entry ? (entry.skipped ? ', skipped' : ', answered') : ''}`);
			nav.append(li);
		});
		const done = S.log.filter(Boolean).length, pct = Math.round(done / S.qs.length * 100);
		$('sideProg').textContent = `${done} of ${S.qs.length} done`;
		$('bar').style.width = pct + '%';
		document.querySelector('.progress').setAttribute('aria-valuenow', pct);
	}
	function showQuestion() {
		const item = S.qs[S.i];
		const card = $('qCard'), fresh = card.cloneNode(true);
		card.replaceWith(fresh);
		fresh.id = 'qCard';
		$('qMeta').textContent = `Question ${S.i + 1} of ${S.qs.length} - ${item.topic || ''}`;
		$('qText').textContent = item.q;
		show($('hintText'), false);
		$('answer').value = '';
		showErr($('roomErr'), '');
		show($('answerBox')); show($('feedback'), false); show($('nextBtn'), false);
		$('hintBtn').textContent = 'Show a hint';
		renderNav();
		$('answer').focus({ preventScroll: true });
	}
	function addHistory(item, answer, skipped) {
		const h = $('history');
		h.append(el('div', { class: 'bubble ai', text: item.q }), el('div', { class: 'bubble me', text: skipped ? 'Skipped' : answer }));
	}
	function startSession(qs) {
		S.qs = qs; S.i = 0; S.log = [];
		$('history').replaceChildren();
		show($('results'), false); show($('room'));
		$('roomTitle').textContent = labelOf(FOCUS, S.focus);
		$('sideCat').textContent = `${labelOf(FOCUS, S.focus)}, ${labelOf(LEVELS, S.level).toLowerCase()}`;
		$('sideSummary').textContent = (S.analysis.summary[0] || S.analysis.skills.slice(0, 5).join(', ') || 'No summary found in the text.').slice(0, 160);
		showQuestion();
		scrollTo($('room'));
	}
	async function submitAnswer() {
		if (S.busy) return;
		const answer = $('answer').value.trim();
		if (!answer) return showErr($('roomErr'), 'Write an answer first, or choose Skip question.');
		showErr($('roomErr'), '');
		setBusy(true);
		try {
			const item = S.qs[S.i];
			const fb = await getFeedback(answer, item, S.focus, S.level);
			S.log[S.i] = { answer, fb, skipped: false };
			addHistory(item, answer, false);
			renderFeedback(fb);
			show($('answerBox'), false);
			$('nextBtn').textContent = S.i === S.qs.length - 1 ? 'See summary' : 'Next question';
			show($('nextBtn'));
			renderNav();
		} catch (e) {
			showErr($('roomErr'), 'Feedback could not be loaded. Check your connection and try again. ' + e.message);
		} finally { setBusy(false); }
	}
	function skipQuestion() {
		if (S.busy) return;
		S.log[S.i] = { skipped: true };
		addHistory(S.qs[S.i], '', true);
		advance();
	}
	function advance() {
		if (S.i >= S.qs.length - 1) return showResults();
		S.i++; showQuestion();
	}
	function renderFeedback(fb) {
		const box = $('feedback'); box.replaceChildren();
		box.append(el('span', { class: 'tag', text: fb.simulated ? 'Simulated feedback: rule-based, not AI' : 'AI-generated feedback' }));
		const sec = (title, node) => box.append(el('h3', { text: title }), node);
		sec('What went well', list(fb.well || [], 'Nothing listed.'));
		sec('What could be improved', list(fb.improve || [], 'Nothing listed.'));
		sec('Missing concepts or details', list(fb.missing || [], 'Nothing listed.'));
		sec('Suggested structure', el('p', { text: fb.structure || '' }));
		sec('One tip', el('p', { text: fb.tip || '' }));
		show(box); box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}

	/* ---------- Results ---------- */
	function showResults() {
		const answered = S.log.filter(x => x && !x.skipped);
		const uniq = arr => [...new Set(arr)].slice(0, 4);
		const weakIdx = S.qs.map((_, i) => i).filter(i => !S.log[i] || S.log[i].skipped || (S.log[i].fb && S.log[i].fb.short));
		const topics = uniq(weakIdx.map(i => S.qs[i].topic).filter(Boolean));
		const follow = (topics.length ? topics : uniq(S.qs.map(q => q.topic))).slice(0, 3).map(t => `Can you give a specific example that shows your strength in "${t}"?`);
		const defs = [
			['Questions completed', list([`${answered.length} answered, ${S.log.length - answered.length} skipped, out of ${S.qs.length}.`], '')],
			['Strengths shown', list(uniq(answered.flatMap(x => x.fb.well || [])), 'Answer at least one question to see strengths.')],
			['Areas to improve', list(uniq(answered.flatMap(x => x.fb.improve || [])), 'Answer at least one question to see notes.')],
			['Topics to revise', list(topics, 'No weak topics found by the rules.')],
			['Suggested follow-up questions', list(follow, 'None.')]
		];
		const box = $('resCards'); box.replaceChildren();
		defs.forEach(([t, n]) => box.append(el('div', { class: 'card' }, [el('h3', { text: t }), n])));
		S.weak = weakIdx;
		show($('room'), false); show($('results'));
		scrollTo($('results'));
	}

	/* ---------- Voice dictation (browser speech recognition, optional) ---------- */
	function initVoice() {
		const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
		const btn = $('micBtn'), note = $('micNote');
		if (!SR) { btn.disabled = true; note.textContent = 'Voice dictation is not supported in this browser. Chrome and Edge usually support it.'; return; }
		note.textContent = 'Dictation uses your browser\'s speech service and asks for microphone permission.';
		const rec = new SR(); rec.lang = 'en-IN'; rec.interimResults = false;
		let on = false;
		rec.onresult = e => { const t = e.results[e.results.length - 1][0].transcript; $('answer').value += (($('answer').value && ' ') + t); };
		rec.onend = () => { on = false; btn.textContent = 'Dictate'; };
		rec.onerror = e => showErr($('roomErr'), e.error === 'not-allowed' ? 'Microphone access was blocked. Allow it in your browser settings.' : 'Dictation stopped: ' + e.error);
		btn.addEventListener('click', () => { if (on) rec.stop(); else { showErr($('roomErr'), ''); rec.start(); on = true; btn.textContent = 'Stop dictation'; } });
	}

	/* ---------- Wiring ---------- */
	function init() {
		initTheme(); initMenu(); initUpload(); initVoice();
		renderOpts($('focusOpts'), 'focus', FOCUS, 'general');
		renderOpts($('diffOpts'), 'level', LEVELS, 'intermediate');

		$('analyzeBtn').addEventListener('click', () => {
			const text = $('resumeText').value.trim();
			if (text.length < 30) return showErr($('textErr'), 'Paste your resume text first (at least a few lines). Files cannot be read in demo mode.');
			showErr($('textErr'), '');
			S.text = text; S.analysis = analyze(text);
			renderAnalysis(S.analysis);
			show($('analysis')); show($('room'), false); show($('results'), false);
			scrollTo($('analysis'));
		});

		$('genBtn').addEventListener('click', async () => {
			const btn = $('genBtn');
			S.focus = picked('focus'); S.level = picked('level');
			btn.disabled = true; btn.textContent = 'Generating...';
			try {
				const qs = await getQuestions(S.text, S.analysis, S.focus, S.level);
				if (!Array.isArray(qs) || !qs.length) throw new Error('No questions were returned.');
				startSession(qs);
			} catch (e) {
				toast('Questions could not be generated. ' + e.message);
			} finally { btn.disabled = false; btn.textContent = 'Generate my questions'; }
		});

		$('submitBtn').addEventListener('click', submitAnswer);
		$('answer').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitAnswer(); });
		$('skipBtn').addEventListener('click', skipQuestion);
		$('nextBtn').addEventListener('click', advance);
		$('hintBtn').addEventListener('click', () => {
			const h = $('hintText'), open = h.hidden;
			h.textContent = S.qs[S.i].hint || 'No hint for this question.';
			show(h, open);
			$('hintBtn').textContent = open ? 'Hide hint' : 'Show a hint';
		});
		$('restartBtn').addEventListener('click', () => startSession(S.qs));
		$('retryBtn').addEventListener('click', () => startSession(S.qs));
		$('weakBtn').addEventListener('click', () => {
			if (!S.weak.length) return toast('No weak areas were found in this session.');
			startSession(S.weak.map(i => S.qs[i]));
		});
		$('newBtn').addEventListener('click', () => {
			S.qs = []; S.log = [];
			['room', 'results', 'analysis'].forEach(id => show($(id), false));
			$('resumeText').value = ''; clearFile();
			scrollTo($('start'));
		});
	}
	init();
})();