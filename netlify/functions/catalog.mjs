import { getStore } from "@netlify/blobs";
import { hasValidOrigin, isAuthorized } from "../lib/auth.mjs";
import { defaultCourses } from "../lib/default-courses.mjs";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": status === 200 ? "no-cache, max-age=0" : "no-store",
    "x-content-type-options": "nosniff"
  }
});

const text = (value, max) => String(value ?? "").trim().slice(0, max);

function sanitizeCatalog(input) {
  if (!Array.isArray(input) || input.length > 100) throw new Error("Некорректный каталог");
  return input.map((course, courseIndex) => {
    if (!course || typeof course !== "object" || !Array.isArray(course.lessons) || course.lessons.length > 200) throw new Error("Некорректный курс");
    const title = text(course.title, 160);
    if (!title) throw new Error("У курса нет названия");
    return {
      id: text(course.id, 100) || `course-${Date.now()}-${courseIndex}`,
      title,
      category: text(course.category, 40) || "AI",
      level: text(course.level, 60) || "Начинающий",
      duration: text(course.duration, 40) || "1 час",
      description: text(course.description, 3000),
      published: course.published !== false,
      lessons: course.lessons.map((lesson, lessonIndex) => {
        const lessonTitle = text(lesson?.title, 180);
        if (!lessonTitle) throw new Error("У урока нет названия");
        const videoUrl = text(lesson.videoUrl, 700);
        if (videoUrl && !/^https:\/\/(?:www\.)?rutube\.ru\//i.test(videoUrl)) throw new Error("Разрешены только ссылки Rutube");
        return {
          id: text(lesson.id, 100) || `lesson-${Date.now()}-${lessonIndex}`,
          title: lessonTitle,
          duration: text(lesson.duration, 40) || "15 мин",
          videoUrl,
          description: text(lesson.description, 6000),
          homework: text(lesson.homework, 6000)
        };
      })
    };
  });
}

async function readCatalog(store) {
  let catalog = await store.get("catalog", { type: "json", consistency: "strong" });
  if (!catalog) {
    catalog = defaultCourses;
    await store.setJSON("catalog", catalog, { onlyIfNew: true });
  }
  return catalog;
}

export default async (request) => {
  try {
    const store = getStore({ name: "pacesetter-courses", consistency: "strong" });
    if (request.method === "GET") {
      const allCourses = await readCatalog(store);
      const wantsAdmin = new URL(request.url).searchParams.get("admin") === "1";
      if (wantsAdmin && !isAuthorized(request)) return json({ error: "Требуется вход" }, 401);
      return json(wantsAdmin ? allCourses : allCourses.filter((course) => course.published));
    }

    if (request.method !== "PUT") return json({ error: "Метод не поддерживается" }, 405);
    if (!hasValidOrigin(request)) return json({ error: "Недопустимый источник запроса" }, 403);
    if (!isAuthorized(request)) return json({ error: "Требуется вход" }, 401);

    const body = await request.json();
    const catalog = sanitizeCatalog(body.courses);
    await store.setJSON("catalog", catalog);
    return json({ ok: true, courses: catalog.length, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Catalog function error", error);
    return json({ error: error instanceof Error ? error.message : "Ошибка хранения каталога" }, 400);
  }
};
