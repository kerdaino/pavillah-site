import { createClient } from "@sanity/client";

// Sanity client
export const sanityClient = createClient({
  projectId: 'tr7gpebz',
  dataset: 'production',
  useCdn: true,
  apiVersion: '2025-11-21',
  ignoreBrowserTokenWarning: true,
})


// Escape helper
function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// Load projects
export async function loadProjects(containerEl) {
  containerEl.innerHTML = '<p class="muted">Loading projects…</p>'
  try {
    const query = `*[_type == "project"] | order(_createdAt desc){
      _id,
      title,
      description,
      "images": images[].asset->url,
      videos
    }`

    const data = await sanityClient.fetch(query)

    if (!data || data.length === 0) {
      containerEl.innerHTML = '<p class="muted">No projects yet.</p>'
      return
    }

    containerEl.innerHTML = ''
    data.forEach((p) => {
      const card = document.createElement('article')
      card.className = 'project-card fade-up'

      const imgUrl = p.images && p.images.length ? p.images[0] : null

      let videoHtml = ''
      if (p.videos && p.videos.length) {
        videoHtml = '<div class="muted">Video links available</div>'
      }

      card.innerHTML = `
        ${imgUrl 
          ? `<img loading="lazy" class="project-thumb" src="${imgUrl}" alt="${escapeHtml(p.title)}" />`
          : `<div style="height:160px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#9ca3af">No image</div>`}
        <div class="project-body">
          <h4>${escapeHtml(p.title)}</h4>
          <p>${escapeHtml(p.description || '')}</p>
          ${videoHtml}
        </div>
      `
      containerEl.appendChild(card)
    })

  } catch (err) {
    console.error(err)
    containerEl.innerHTML = '<p class="muted">Failed to load projects.</p>'
  }
}

/* Mobile nav toggle */
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");

  if (!toggle || !nav) return;

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle.classList.toggle("open");
    nav.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target) && !toggle.contains(e.target)) {
      nav.classList.remove("show");
      toggle.classList.remove("open");
    }
  });

  window.addEventListener("scroll", () => {
    nav.classList.remove("show");
    toggle.classList.remove("open");
  });
});
