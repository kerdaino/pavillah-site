export function initSupabase(url, anonKey) {
  // Create a supabase client instance
  // We use the global Supabase library loaded via CDN -> window.supabase
  // If using bundler, import createClient from '@supabase/supabase-js'
  // Return a supabase client instance
  if (!url || !anonKey) {
    console.warn('Supabase URL or ANON key missing. CMS functions will fail until configured.');
  }
  const supabase = window.supabase.createClient(url, anonKey, {
    auth: { autoRefreshToken: true, persistSession: true }
  });
  return supabase;
}

/* --------------------------
   PROJECTS: load and render
   -------------------------- */
export async function loadProjects(supabase, containerEl) {
  if (!supabase) return;
  containerEl.innerHTML = '<p class="muted">Loading projects…</p>';
  try {
    // Fetch projects table (public). Table structure assumed:
    // id, title, description, images (json), videos (json or video link), created_at
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!data || data.length === 0) {
      containerEl.innerHTML = '<p class="muted">No projects yet.</p>';
      return;
    }
    containerEl.innerHTML = '';
    for (const p of data) {
      const card = document.createElement('article');
      card.className = 'project-card fade-up';
      const imgUrl = (p.images && p.images.length && p.images[0]) ? await getPublicUrlForFile(supabase, p.images[0]) : null;
      card.innerHTML = `
        ${imgUrl ? `<img loading="lazy" class="project-thumb" src="${imgUrl}" alt="${escapeHtml(p.title)}" />` : `<div style="height:160px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#9ca3af">No image</div>`}
        <div class="project-body">
          <h4>${escapeHtml(p.title)}</h4>
          <p>${escapeHtml(p.description || '')}</p>
          ${p.videos && p.videos.length ? `<div class="muted">Video links available</div>` : ''}
        </div>
      `;
      containerEl.appendChild(card);
    }
  } catch (err) {
    console.error(err);
    containerEl.innerHTML = '<p class="muted">Failed to load projects.</p>';
  }
}

/* Helper: get public URL for a file path stored in Supabase storage (bucket: "projects") */
export async function getPublicUrlForFile(supabase, filePath) {
  try {
    // Adjust bucket name if you used another name
    const { data } = supabase.storage.from('projects').getPublicUrl(filePath);
    return data ? data.publicUrl : null;
  } catch (err) {
    console.error(err);
    return null;
  }
}

/* --------------------------
   CONTACT FORM: submit
   -------------------------- */
export async function submitContact(supabase, contactObj) {
  // contactObj: {name, email, phone, message}
  // Save to 'contacts' table. Create this table in Supabase dashboard with columns: id, name, email, phone, message, created_at
  try {
    const { data, error } = await supabase.from('contacts').insert([contactObj]);
    return { data, error };
  } catch (err) {
    return { error: err };
  }
}

/* --------------------------
   ADMIN / AUTH handlers
   -------------------------- */
export function adminAuthHandlers(supabase) {
  // elements
  const signupBtn = document.getElementById('signupBtn');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const authMsg = document.getElementById('authMsg');

  if (!signupBtn) return;

  async function updateUI() {
    const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : supabase.auth.user && supabase.auth.user();
    // supabase v2: use getUser
    const { data: sessionData } = await supabase.auth.getSession();
    const userObj = sessionData ? sessionData.session?.user : null;
    if (userObj) {
      authMsg.textContent = `Signed in as ${userObj.email}`;
      signupBtn.classList.add('hidden');
      loginBtn.classList.add('hidden');
      logoutBtn.classList.remove('hidden');
      document.getElementById('uploader').classList.remove('hidden');
      document.getElementById('uploadsList').classList.remove('hidden');
    } else {
      authMsg.textContent = 'Not signed in';
      signupBtn.classList.remove('hidden');
      loginBtn.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
      document.getElementById('uploader').classList.add('hidden');
      document.getElementById('uploadsList').classList.add('hidden');
    }
  }

  signupBtn.addEventListener('click', async () => {
    const form = document.getElementById('loginForm');
    const fm = new FormData(form);
    const email = fm.get('email');
    const password = fm.get('password');
    authMsg.textContent = 'Signing up…';
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) authMsg.textContent = 'Signup error: ' + (error.message || error);
    else authMsg.textContent = 'Signup successful. Check email for confirmation (if enabled). Then log in.';
    await updateUI();
  });

  loginBtn.addEventListener('click', async () => {
    const form = document.getElementById('loginForm');
    const fm = new FormData(form);
    const email = fm.get('email');
    const password = fm.get('password');
    authMsg.textContent = 'Logging in…';
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) authMsg.textContent = 'Login error: ' + (error.message || error);
    else authMsg.textContent = 'Logged in';
    await updateUI();
  });

  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    authMsg.textContent = 'Signed out';
    await updateUI();
  });

  // Keep UI in sync on page load
  window.addEventListener('load', updateUI);
  // Listen to auth changes
  supabase.auth.onAuthStateChange(() => updateUI());
}

/* --------------------------
   ADMIN UPLOAD HANDLERS
   -------------------------- */
export function adminUploadHandlers(supabase) {
  const projectForm = document.getElementById('projectForm');
  const projMsg = document.getElementById('projMsg');
  const recent = document.getElementById('recentUploads');

  if (!projectForm) return;

  projectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    projMsg.textContent = 'Uploading…';
    const formData = new FormData(projectForm);
    const title = formData.get('title');
    const description = formData.get('description');
    const videoLink = formData.get('videoLink') || null;
    const images = projectForm.querySelector('input[name="images"]').files;

    // Upload images to Supabase storage bucket 'projects' folder by user id + timestamp
    let imagePaths = [];
    try {
      for (const file of images) {
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^\w.\-]/g, '_');
        const path = `${timestamp}_${safeName}`;
        // Check file size (e.g., limit client-side to 5MB)
        if (file.size > 5 * 1024 * 1024) {
          projMsg.textContent = 'File too large: ' + file.name;
          return;
        }
        const { data, error } = await supabase.storage
          .from('projects')
          .upload(path, file, { cacheControl: '3600', upsert: false });
        if (error) throw error;
        imagePaths.push(path);
      }

      // Create project record in 'projects' table
      const projectPayload = {
        title,
        description,
        images: imagePaths,
        videos: videoLink ? [videoLink] : [],
      };
      const { data: insertData, error: insertError } = await supabase.from('projects').insert([projectPayload]);
      if (insertError) throw insertError;
      projMsg.textContent = 'Project uploaded successfully';
      projectForm.reset();
      // refresh list
      await displayRecentUploads(supabase, recent);
    } catch (err) {
      console.error(err);
      projMsg.textContent = 'Upload failed';
    }
  });

  // initial list
  displayRecentUploads(supabase, recent);
}

async function displayRecentUploads(supabase, el) {
  if (!el) return;
  el.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    if (!data || data.length === 0) {
      el.innerHTML = '<p class="muted">No uploads yet.</p>';
      return;
    }
    el.innerHTML = '';
    for (const p of data) {
      const d = document.createElement('div');
      d.style.padding = '0.5rem 0';
      d.innerHTML = `<strong>${escapeHtml(p.title)}</strong><div class="muted" style="font-size:0.9rem">${new Date(p.created_at).toLocaleString()}</div>`;
      el.appendChild(d);
    }
  } catch (err) {
    console.error(err);
    el.innerHTML = '<p class="muted">Failed to load uploads.</p>';
  }
}

/* --------------------------
   Utility helper functions
   -------------------------- */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/* Minimal page animation init */
document.addEventListener('DOMContentLoaded', () => {
  // reveal elements with fade-up classes (they have CSS animation)
  // nothing to do here because CSS animations auto-run when class present
});

/* Export any additional helpers if needed */
/* --------------------------
   MOBILE NAV TOGGLE
---------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");

  if (!toggle || !nav) return;

  // Toggle the menu
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle.classList.toggle("open");
    nav.classList.toggle("show");
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target) && !toggle.contains(e.target)) {
      nav.classList.remove("show");
      toggle.classList.remove("open");
    }
  });

  // Close on scroll
  window.addEventListener("scroll", () => {
    nav.classList.remove("show");
    toggle.classList.remove("open");
  });
});
