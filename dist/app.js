"use strict";

const API_CATALOG = "/api/catalog";
const API_AUTH = "/api/auth";
const ADMIN_SESSION_KEY = "pacesetter_admin_ui";

const fallbackCourses = [
  { id:"ai-start",title:"AI без сложных слов",category:"AI",level:"Начинающий",duration:"3 часа",description:"Практический старт: как ставить задачи нейросетям, проверять ответы и собирать свой рабочий процесс.",published:true,lessons:[
    { id:"ai-1",title:"Как устроены нейросети",duration:"18 мин",videoUrl:"https://rutube.ru/video/",description:"Разберём базовые принципы генеративного AI и поймём, где он полезен в ежедневной работе.",homework:"Выберите три повторяющиеся рабочие задачи и опишите, какой результат должен выдавать AI." },
    { id:"ai-2",title:"Хороший промпт: контекст, роль, формат",duration:"26 мин",videoUrl:"https://rutube.ru/video/",description:"Соберём универсальную структуру запроса, которая даёт предсказуемый результат.",homework:"Напишите один промпт по структуре: роль → контекст → задача → ограничения → формат ответа." }
  ]},
  { id:"onec-ai",title:"AI-инструменты для 1С",category:"1С",level:"Практика",duration:"4,5 часа",description:"Используйте AI для разбора требований, подготовки кода, документации и тестовых сценариев в проектах 1С.",published:true,lessons:[
    { id:"onec-1",title:"Разбор задачи на языке бизнеса",duration:"24 мин",videoUrl:"https://rutube.ru/video/",description:"Превращаем заметки заказчика в структурированную постановку для разработки.",homework:"Подготовьте постановку задачи: цель, сценарий, ограничения и критерии приёмки." }
  ]},
  { id:"automation",title:"Автоматизация рутины с AI",category:"AI",level:"Средний",duration:"5 часов",description:"От таблиц и писем до регламентов: проектируем понятные сценарии автоматизации без лишней магии.",published:true,lessons:[] }
];

let courses = structuredClone(fallbackCourses);
let activeFilter = "Все";
let searchQuery = "";
let adminView = "courses";
let cloudConnected = false;
let networkAnimation = null;

const app = document.getElementById("app");
document.getElementById("year").textContent = new Date().getFullYear();

function escapeHtml(value="") {
  return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-zа-яё0-9]+/gi,"-").replace(/^-|-$/g,"") + "-" + Date.now().toString(36).slice(-5);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

async function api(url, options={}) {
  const response = await fetch(url, { credentials:"same-origin", ...options, headers:{"content-type":"application/json",...(options.headers||{})} });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Ошибка соединения с сервером");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadCourses(admin=false) {
  try {
    courses = await api(`${API_CATALOG}${admin ? "?admin=1" : ""}`);
    cloudConnected = true;
  } catch (error) {
    cloudConnected = false;
    if (admin && error.status === 401) sessionStorage.removeItem(ADMIN_SESSION_KEY);
    if (!admin) courses = structuredClone(fallbackCourses);
    throw error;
  }
}

async function saveCourses(message="Сохранено в облаке") {
  try {
    await api(API_CATALOG, { method:"PUT", body:JSON.stringify({courses}) });
    cloudConnected = true;
    showToast(message);
    return true;
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      showToast("Сессия завершена. Войдите снова");
      location.hash = "admin";
      renderAdminLogin();
    } else showToast(error.message);
    return false;
  }
}

function lessonWord(count) {
  const d=count%10,h=count%100;
  if(d===1&&h!==11)return"урок";
  if(d>=2&&d<=4&&(h<12||h>14))return"урока";
  return"уроков";
}

function cardCode(course,index) {
  if(course.category.toUpperCase().includes("1С")) return "1C";
  if(course.category.toUpperCase().includes("AI")) return "AI";
  return String(index+1).padStart(2,"0");
}

function courseCard(course,index) {
  return `<a class="course-card" href="#course/${encodeURIComponent(course.id)}">
    <div class="course-visual"><span class="course-code">${escapeHtml(cardCode(course,index))}</span><span class="course-category">${escapeHtml(course.category)}</span></div>
    <div class="course-body"><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.description)}</p>
      <div class="course-meta"><span>${course.lessons.length} ${lessonWord(course.lessons.length)}</span><span>${escapeHtml(course.level)}</span><span>${escapeHtml(course.duration)}</span></div>
      <div class="course-cta"><span>ДЗ включено</span><span>Смотреть →</span></div>
    </div></a>`;
}

function renderHome() {
  stopNetwork();
  const visible = courses.filter(c => c.published !== false);
  const categories = ["Все", ...new Set(visible.map(c => c.category))];
  const q = searchQuery.toLowerCase().trim();
  const filtered = visible.filter(c => (activeFilter === "Все" || c.category === activeFilter) && (!q || `${c.title} ${c.description} ${c.category}`.toLowerCase().includes(q)));
  app.innerHTML = `<section class="hero" id="home">
    <canvas class="network-canvas" id="network" aria-hidden="true"></canvas>
    <div class="hero-content">
      <div class="eyebrow-badge"><span class="live-dot"></span><strong>PaceSetter School</strong><span>•</span><span>1С &amp; Искусственный интеллект</span></div>
      <h1>Онлайн-курсы по <span>1С и AI</span></h1>
      <p class="hero-subtitle">Практические видеоуроки с Rutube и домашними заданиями. Бесплатно, понятно и в удобном темпе.</p>
      <div class="search-panel"><label class="search-wrap"><span hidden>Поиск по курсам</span><input id="course-search" type="search" value="${escapeHtml(searchQuery)}" placeholder="Поиск по 1С, AI, автоматизации..."></label><a class="primary-button" href="#catalog">Курсы ↓</a></div>
      <div class="filter-row">${categories.map(cat => `<button class="filter-button ${activeFilter===cat?"active":""}" data-filter="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join("")}</div>
    </div>
  </section>
  <section class="section" id="catalog"><div class="container">
    <div class="section-head"><div><p class="section-label">▣ Каталог программ обучения</p><h2>Курсы по 1С и AI</h2></div><span class="catalog-count">ПОКАЗАНО ${filtered.length} ИЗ ${visible.length}</span></div>
    <div class="course-grid">${filtered.length ? filtered.map(courseCard).join("") : `<div class="empty-state"><h3>Ничего не найдено</h3><p>Измените запрос или выберите другую категорию.</p><button class="secondary-button" data-clear-search>Сбросить фильтры</button></div>`}</div>
  </div></section>`;
  app.querySelector("#course-search")?.addEventListener("input", e => { searchQuery=e.target.value; renderHome(); document.getElementById("catalog")?.scrollIntoView(); });
  app.querySelectorAll("[data-filter]").forEach(btn => btn.addEventListener("click",()=>{activeFilter=btn.dataset.filter;renderHome();document.getElementById("catalog")?.scrollIntoView();}));
  app.querySelector("[data-clear-search]")?.addEventListener("click",()=>{searchQuery="";activeFilter="Все";renderHome();});
  startNetwork();
}

function startNetwork() {
  const canvas=document.getElementById("network");
  if(!canvas||matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  const ctx=canvas.getContext("2d");
  let points=[];
  const resize=()=>{canvas.width=canvas.clientWidth*devicePixelRatio;canvas.height=canvas.clientHeight*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);points=Array.from({length:Math.min(30,Math.max(14,Math.floor(canvas.clientWidth/42)))},()=>({x:Math.random()*canvas.clientWidth,y:Math.random()*canvas.clientHeight,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,r:Math.random()*1.4+.7}));};
  const draw=()=>{ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);points.forEach((p,i)=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=canvas.clientWidth;if(p.x>canvas.clientWidth)p.x=0;if(p.y<0)p.y=canvas.clientHeight;if(p.y>canvas.clientHeight)p.y=0;for(let j=i+1;j<points.length;j++){const q=points[j],d=Math.hypot(p.x-q.x,p.y-q.y);if(d<140){ctx.strokeStyle=`rgba(255,255,255,${(1-d/140)*.15})`;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}}ctx.fillStyle="rgba(255,255,255,.46)";ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();});networkAnimation=requestAnimationFrame(draw);};
  resize();window.addEventListener("resize",resize,{once:true});draw();
}

function stopNetwork(){if(networkAnimation)cancelAnimationFrame(networkAnimation);networkAnimation=null;}

function renderCourse(courseId) {
  stopNetwork();
  const course=courses.find(c=>c.id===courseId&&c.published!==false);
  if(!course)return renderNotFound();
  app.innerHTML=`<section class="page-head"><div class="container"><a class="breadcrumb" href="#catalog">← КАТАЛОГ КУРСОВ</a><h1>${escapeHtml(course.title)}</h1><p>${escapeHtml(course.description)}</p></div></section>
  <section class="container course-layout"><div><p class="section-label">▶ Программа курса</p><div class="lesson-list">${course.lessons.length?course.lessons.map((lesson,i)=>`<article class="lesson-item"><span>${String(i+1).padStart(2,"0")}</span><div><h3>${escapeHtml(lesson.title)}</h3><p>${escapeHtml(lesson.description)}</p></div><a class="play-button" href="#lesson/${encodeURIComponent(course.id)}/${encodeURIComponent(lesson.id)}" aria-label="Открыть урок ${escapeHtml(lesson.title)}">▶</a></article>`).join(""):`<div class="empty-state"><h3>Уроки готовятся</h3><p>Материалы скоро появятся.</p></div>`}</div></div>
  <aside class="course-aside"><strong>Бесплатный курс</strong><dl><div><dt>Направление</dt><dd>${escapeHtml(course.category)}</dd></div><div><dt>Уровень</dt><dd>${escapeHtml(course.level)}</dd></div><div><dt>Длительность</dt><dd>${escapeHtml(course.duration)}</dd></div><div><dt>Уроков</dt><dd>${course.lessons.length}</dd></div></dl></aside></section>`;
}

function getRutubeEmbed(url) {
  if(!url)return"";
  const direct=url.match(/rutube\.ru\/play\/embed\/([a-zA-Z0-9_-]+)/i);
  if(direct)return`https://rutube.ru/play/embed/${direct[1]}`;
  const video=url.match(/rutube\.ru\/(?:video|shorts)\/([a-zA-Z0-9_-]+)/i);
  return video?`https://rutube.ru/play/embed/${video[1]}`:"";
}

function renderLesson(courseId,lessonId) {
  stopNetwork();
  const course=courses.find(c=>c.id===courseId&&c.published!==false),lesson=course?.lessons.find(l=>l.id===lessonId);
  if(!course||!lesson)return renderNotFound();
  const embed=getRutubeEmbed(lesson.videoUrl);
  app.innerHTML=`<section class="page-head"><div class="container"><a class="breadcrumb" href="#course/${encodeURIComponent(course.id)}">← ${escapeHtml(course.title)}</a><h1>${escapeHtml(lesson.title)}</h1><p>Урок ${course.lessons.indexOf(lesson)+1} из ${course.lessons.length} · ${escapeHtml(lesson.duration)}</p></div></section>
  <section class="lesson-view"><div class="container"><div class="video-shell">${embed?`<iframe src="${escapeHtml(embed)}" title="${escapeHtml(lesson.title)}" allow="clipboard-write; autoplay" webkitAllowFullScreen mozallowfullscreen allowfullscreen></iframe>`:`<div class="video-placeholder">Видео появится после добавления корректной ссылки Rutube.</div>`}</div><div class="lesson-copy"><article><h2>Описание урока</h2><p>${escapeHtml(lesson.description)||"Описание пока не добавлено."}</p></article><aside class="homework-box"><p class="section-label">Домашнее задание</p><p>${escapeHtml(lesson.homework)||"Задание пока не добавлено."}</p></aside></div></div></section>`;
}

function renderNotFound(){stopNetwork();app.innerHTML=`<section class="section"><div class="container empty-state"><h3>Страница не найдена</h3><p>Материал мог быть перемещён или удалён.</p><a class="primary-button" href="#home">На главную</a></div></section>`;}
function isAdminAuthorized(){return sessionStorage.getItem(ADMIN_SESSION_KEY)==="yes";}

function renderAdminLogin() {
  stopNetwork();
  app.innerHTML=`<section class="login-wrap"><form class="login-card" id="admin-login"><div class="eyebrow-badge">◆ ЗАЩИЩЁННЫЙ РАЗДЕЛ</div><h1>Вход в панель</h1><p>Управление курсами, видеоуроками и домашними заданиями.</p><div class="form" style="padding:0"><div class="field"><label for="login">Логин</label><input id="login" name="login" autocomplete="username" required></div><div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="current-password" required></div><button class="primary-button" type="submit">Войти</button></div></form></section>`;
  document.getElementById("admin-login").addEventListener("submit",async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector("button");button.disabled=true;button.textContent="Проверяем…";
    try{const form=Object.fromEntries(new FormData(event.currentTarget));await api(API_AUTH,{method:"POST",body:JSON.stringify(form)});sessionStorage.setItem(ADMIN_SESSION_KEY,"yes");await loadCourses(true);renderAdmin();showToast("Вход выполнен");}
    catch(error){showToast(location.protocol==="file:"?"Админ-панель работает после публикации на Netlify":error.message);button.disabled=false;button.textContent="Войти";}
  });
}

function renderAdmin() {
  stopNetwork();
  if(!isAdminAuthorized())return renderAdminLogin();
  const lessonCount=courses.reduce((n,c)=>n+c.lessons.length,0);
  app.innerHTML=`<section class="admin-shell"><aside class="admin-sidebar"><h2>PS / ADMIN</h2><div class="cloud-status"><span class="live-dot"></span>ОБЩАЯ БАЗА NETLIFY</div><nav class="admin-nav"><button class="${adminView==="courses"?"active":""}" data-view="courses">Курсы</button><button class="${adminView==="data"?"active":""}" data-view="data">Резервная копия</button><button data-logout>Выйти</button></nav></aside><div class="admin-main">
  ${adminView==="courses"?`<div class="admin-head"><div><p class="section-label">Управление контентом</p><h1>Курсы</h1></div><button class="primary-button" data-add-course>+ Новый курс</button></div><div class="admin-stats"><div class="admin-stat"><strong>${courses.length}</strong><span>ВСЕГО КУРСОВ</span></div><div class="admin-stat"><strong>${lessonCount}</strong><span>ВИДЕОУРОКОВ</span></div><div class="admin-stat"><strong>${courses.filter(c=>c.published).length}</strong><span>ОПУБЛИКОВАНО</span></div></div><div class="admin-list">${courses.length?courses.map((c,i)=>`<div class="admin-row"><small>${String(i+1).padStart(2,"0")}</small><div><div class="admin-row-title">${escapeHtml(c.title)}</div><small>${c.lessons.length} ${lessonWord(c.lessons.length)}</small></div><small>${escapeHtml(c.category)}</small><span class="status ${c.published?"":"draft"}">${c.published?"На сайте":"Черновик"}</span><div class="row-actions"><button class="icon-button" data-lessons="${escapeHtml(c.id)}" title="Уроки" aria-label="Уроки курса">▶</button><button class="icon-button" data-edit-course="${escapeHtml(c.id)}" title="Редактировать" aria-label="Редактировать курс">✎</button><button class="icon-button danger" data-delete-course="${escapeHtml(c.id)}" title="Удалить" aria-label="Удалить курс">×</button></div></div>`).join(""):`<div class="empty-state"><h3>Курсов пока нет</h3><p>Создайте первый курс.</p></div>`}</div>`:renderDataPanel()}</div></section>`;
  bindAdminEvents();
}

function renderDataPanel(){return`<div class="admin-head"><div><p class="section-label">Данные</p><h1>Резервная копия</h1></div></div><div class="form" style="padding:0;max-width:720px"><div class="data-note">Основная копия каталога хранится в Netlify Blobs и доступна всем посетителям сайта. JSON-файл нужен только как дополнительная резервная копия.</div><div class="field"><label>Каталог курсов</label><div class="admin-actions"><button class="primary-button" data-export>Экспорт JSON</button><button class="secondary-button" data-import>Импорт JSON</button><input type="file" accept="application/json" data-import-file hidden></div></div></div>`;}

function bindAdminEvents(){
  app.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{adminView=b.dataset.view;renderAdmin();}));
  app.querySelector("[data-logout]")?.addEventListener("click",logout);
  app.querySelector("[data-add-course]")?.addEventListener("click",()=>openCourseModal());
  app.querySelectorAll("[data-edit-course]").forEach(b=>b.addEventListener("click",()=>openCourseModal(b.dataset.editCourse)));
  app.querySelectorAll("[data-lessons]").forEach(b=>b.addEventListener("click",()=>openLessonsModal(b.dataset.lessons)));
  app.querySelectorAll("[data-delete-course]").forEach(b=>b.addEventListener("click",()=>deleteCourse(b.dataset.deleteCourse)));
  app.querySelector("[data-export]")?.addEventListener("click",exportData);
  app.querySelector("[data-import]")?.addEventListener("click",()=>app.querySelector("[data-import-file]").click());
  app.querySelector("[data-import-file]")?.addEventListener("change",importData);
}

async function logout(){try{await api(API_AUTH,{method:"DELETE"});}catch{}sessionStorage.removeItem(ADMIN_SESSION_KEY);courses=structuredClone(fallbackCourses);renderAdminLogin();showToast("Вы вышли из панели");}

function modalTemplate(title,content){const wrap=document.createElement("div");wrap.className="modal-backdrop";wrap.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="modal-head"><h2>${escapeHtml(title)}</h2><button class="modal-close" aria-label="Закрыть">×</button></div>${content}</div>`;document.body.append(wrap);const close=()=>wrap.remove();wrap.querySelector(".modal-close").addEventListener("click",close);wrap.addEventListener("click",e=>{if(e.target===wrap)close();});const esc=e=>{if(e.key==="Escape"){close();document.removeEventListener("keydown",esc);}};document.addEventListener("keydown",esc);wrap.querySelector("input,textarea,select,button")?.focus();return wrap;}

function openCourseModal(courseId=""){
  const course=courses.find(c=>c.id===courseId);
  const modal=modalTemplate(course?"Редактировать курс":"Новый курс",`<form class="form"><div class="field"><label for="c-title">Название</label><input id="c-title" name="title" value="${escapeHtml(course?.title||"")}" required maxlength="160"></div><div class="field"><label for="c-description">Описание</label><textarea id="c-description" name="description" required maxlength="3000">${escapeHtml(course?.description||"")}</textarea></div><div class="form-grid"><div class="field"><label for="c-category">Направление</label><select id="c-category" name="category"><option ${course?.category==="AI"?"selected":""}>AI</option><option ${course?.category==="1С"?"selected":""}>1С</option></select></div><div class="field"><label for="c-level">Уровень</label><input id="c-level" name="level" value="${escapeHtml(course?.level||"Начинающий")}" required></div></div><div class="form-grid"><div class="field"><label for="c-duration">Длительность</label><input id="c-duration" name="duration" value="${escapeHtml(course?.duration||"1 час")}" required></div><div class="field"><label for="c-status">Статус</label><select id="c-status" name="published"><option value="true" ${course?.published!==false?"selected":""}>Опубликован</option><option value="false" ${course?.published===false?"selected":""}>Черновик</option></select></div></div><div class="form-actions"><button type="button" class="secondary-button" data-cancel>Отмена</button><button type="submit" class="primary-button">Сохранить</button></div></form>`);
  modal.querySelector("[data-cancel]").addEventListener("click",()=>modal.remove());
  modal.querySelector("form").addEventListener("submit",async e=>{e.preventDefault();const button=e.currentTarget.querySelector('[type="submit"]'),data=Object.fromEntries(new FormData(e.currentTarget));button.disabled=true;if(course)Object.assign(course,data,{published:data.published==="true"});else courses.push({id:slugify(data.title),...data,published:data.published==="true",lessons:[]});if(await saveCourses()){modal.remove();renderAdmin();}else button.disabled=false;});
}

function openLessonsModal(courseId){const course=courses.find(c=>c.id===courseId);if(!course)return;const modal=modalTemplate(`Уроки: ${course.title}`,`<div class="form"><button class="primary-button" data-add-lesson>+ Добавить видео с Rutube</button><div class="admin-list">${course.lessons.length?course.lessons.map((l,i)=>`<div class="admin-row" style="grid-template-columns:36px 1fr auto"><small>${String(i+1).padStart(2,"0")}</small><div><div class="admin-row-title">${escapeHtml(l.title)}</div><small>${escapeHtml(l.duration)}</small></div><div class="row-actions"><button class="icon-button" data-edit-lesson="${escapeHtml(l.id)}" aria-label="Редактировать урок">✎</button><button class="icon-button danger" data-delete-lesson="${escapeHtml(l.id)}" aria-label="Удалить урок">×</button></div></div>`).join(""):`<div class="empty-state"><h3>Уроков пока нет</h3><p>Добавьте первое видео с Rutube.</p></div>`}</div></div>`);modal.querySelector("[data-add-lesson]").addEventListener("click",()=>{modal.remove();openLessonEditor(courseId);});modal.querySelectorAll("[data-edit-lesson]").forEach(b=>b.addEventListener("click",()=>{modal.remove();openLessonEditor(courseId,b.dataset.editLesson);}));modal.querySelectorAll("[data-delete-lesson]").forEach(b=>b.addEventListener("click",async()=>{const lesson=course.lessons.find(l=>l.id===b.dataset.deleteLesson);if(lesson&&confirm(`Удалить урок «${lesson.title}»?`)){const backup=course.lessons;course.lessons=course.lessons.filter(l=>l.id!==lesson.id);if(await saveCourses("Урок удалён")){modal.remove();openLessonsModal(courseId);}else course.lessons=backup;}}));}

function openLessonEditor(courseId,lessonId=""){
  const course=courses.find(c=>c.id===courseId),lesson=course?.lessons.find(l=>l.id===lessonId);if(!course)return;
  const modal=modalTemplate(lesson?"Редактировать видеоурок":"Новый видеоурок",`<form class="form"><div class="field"><label for="l-title">Название урока</label><input id="l-title" name="title" value="${escapeHtml(lesson?.title||"")}" required maxlength="180"></div><div class="form-grid"><div class="field"><label for="l-duration">Длительность</label><input id="l-duration" name="duration" value="${escapeHtml(lesson?.duration||"15 мин")}" required></div><div class="field"><label for="l-video">Ссылка на Rutube</label><input id="l-video" name="videoUrl" type="url" placeholder="https://rutube.ru/video/..." value="${escapeHtml(lesson?.videoUrl||"")}" required><span class="field-hint">Вставьте ссылку со страницы видео Rutube.</span></div></div><div class="field"><label for="l-description">Описание урока</label><textarea id="l-description" name="description" required maxlength="6000">${escapeHtml(lesson?.description||"")}</textarea></div><div class="field"><label for="l-homework">Домашнее задание</label><textarea id="l-homework" name="homework" required maxlength="6000">${escapeHtml(lesson?.homework||"")}</textarea></div><div class="form-actions"><button type="button" class="secondary-button" data-cancel>Отмена</button><button type="submit" class="primary-button">Сохранить урок</button></div></form>`);
  modal.querySelector("[data-cancel]").addEventListener("click",()=>{modal.remove();openLessonsModal(courseId);});
  modal.querySelector("form").addEventListener("submit",async e=>{e.preventDefault();const button=e.currentTarget.querySelector('[type="submit"]'),data=Object.fromEntries(new FormData(e.currentTarget));if(!getRutubeEmbed(data.videoUrl)){showToast("Нужна полная ссылка на видео Rutube");return;}button.disabled=true;if(lesson)Object.assign(lesson,data);else course.lessons.push({id:slugify(data.title),...data});if(await saveCourses("Урок сохранён")){modal.remove();renderAdmin();}else button.disabled=false;});
}

async function deleteCourse(courseId){const course=courses.find(c=>c.id===courseId);if(!course||!confirm(`Удалить курс «${course.title}» вместе со всеми уроками?`))return;const backup=courses;courses=courses.filter(c=>c.id!==courseId);if(await saveCourses("Курс удалён"))renderAdmin();else courses=backup;}
function exportData(){const blob=new Blob([JSON.stringify(courses,null,2)],{type:"application/json"}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`pacesetter-courses-${new Date().toISOString().slice(0,10)}.json`;link.click();URL.revokeObjectURL(link.href);showToast("Резервная копия скачана");}
function importData(event){const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{try{const parsed=JSON.parse(reader.result);if(!Array.isArray(parsed))throw new Error();const backup=courses;courses=parsed;if(await saveCourses("Каталог импортирован"))renderAdmin();else courses=backup;}catch{showToast("Не удалось прочитать файл");}};reader.readAsText(file);}

function router(){const parts=(location.hash.replace(/^#/,"")||"home").split("/").map(decodeURIComponent);if(parts[0]==="course"&&parts[1])renderCourse(parts[1]);else if(parts[0]==="lesson"&&parts[1]&&parts[2])renderLesson(parts[1],parts[2]);else if(parts[0]==="admin")renderAdmin();else if(["home","catalog","about"].includes(parts[0])){renderHome();if(parts[0]!=="home")requestAnimationFrame(()=>document.getElementById(parts[0]==="about"?"catalog":parts[0])?.scrollIntoView());}else renderNotFound();}

function registerWebMcp(){const context=document.modelContext;if(!context?.registerTool)return;try{Promise.resolve(context.registerTool({name:"list_published_courses",title:"Показать опубликованные курсы",description:"Возвращает список бесплатных опубликованных курсов.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(){return courses.filter(c=>c.published!==false).map(c=>({id:c.id,title:c.title,category:c.category,lessons:c.lessons.length}));}})).catch(()=>{});}catch{}}

async function init(){app.innerHTML=`<div class="loading-screen">Загружаем курсы…</div>`;try{await loadCourses(false);}catch{showToast("Показана локальная копия. Общая база включится после публикации на Netlify");}router();registerWebMcp();}
window.addEventListener("hashchange",router);
init();
