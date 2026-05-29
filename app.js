// ============================================================
// app.js — Application web Registre MMLC
// ============================================================
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  getFirestore, collection, doc, query, orderBy, onSnapshot,
  getDoc, getDocs, setDoc, addDoc, deleteDoc, serverTimestamp, where
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

import * as PDF from "./pdf.js";

// Initialisation Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ============================================================
// CONSTANTES MÉTIER (copiées du modèle Android)
// ============================================================
const ROLES_MINISTERE = [
  "Pasteur", "Pasteur adjoint", "Ancien", "Diacre", "Diaconesse",
  "Responsable de cellule", "Choriste", "Musicien", "Intercesseur",
  "Évangéliste", "Enseignant école du dimanche", "Accueil",
  "Fidèle", "Nouveau converti"
];

const STATUTS_MATRIMONIAUX = ["Célibataire", "Marié(e)", "Divorcé(e)", "Veuf(ve)"];
const REGULARITES = ["Actif", "Inactif"];

const TYPES_GROUPE = [
  "Cellule de maison", "Groupe de jeunes", "Groupe de femmes",
  "Groupe d'hommes", "Groupe d'enfants", "Chorale",
  "Équipe d'intercession", "Équipe d'accueil", "Équipe louange", "Comité"
];

const TYPES_EVENEMENT = [
  "Culte dominical", "Étude biblique", "Réunion de prière",
  "Cellule de maison", "Veillée", "Convention", "Événement spécial"
];

const COULEURS_GROUPE = [
  "#D4A24A", "#E27D60", "#85DCB0", "#E8A87C", "#C38D9E",
  "#41B3A3", "#5C6E91", "#7CA1B4", "#B8336A", "#3A506B",
  "#1C7C54", "#73AB84"
];

const MOIS_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

const ANNEES_DISPO = Array.from({ length: 2076 - 2025 + 1 }, (_, i) => 2025 + i);

// ============================================================
// ÉTAT GLOBAL
// ============================================================
const state = {
  membres: [],
  groupes: [],
  presences: [],
  unsubMembres: null,
  unsubGroupes: null,
  unsubPresences: null,
  recherche: "",
  rechercheGroupes: "",
  // Pour les stats
  filtreType: "MOIS",
  filtreMois: new Date().getMonth(),
  filtreAnnee: new Date().getFullYear()
};

// ============================================================
// UTILITAIRES
// ============================================================
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function initiales(m) {
  const p = (m.prenom || "").charAt(0);
  const n = (m.nom || "").charAt(0);
  return (p + n).toUpperCase() || "?";
}

function nomComplet(m) {
  return `${m.prenom || ""} ${m.nom || ""}`.trim() || "Sans nom";
}

function moisJourNaissance(m) {
  if (!m.dateNaissance || m.dateNaissance.length < 10) return null;
  return m.dateNaissance.substring(5, 10);
}

function toast(message, type = "info") {
  const container = $("#toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showLoader() { $("#loader").classList.remove("hidden"); }
function hideLoader() { $("#loader").classList.add("hidden"); }

function regulariteHTML(reg) {
  const cl = reg === "Actif" ? "pastille-actif"
    : reg === "Inactif" ? "pastille-inactif" : "pastille-inconnu";
  return `<span class="pastille ${cl}" title="${escapeHtml(reg || "Inconnu")}"></span>`;
}

// ============================================================
// AUTHENTIFICATION
// ============================================================
function setupLogin() {
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    const btn = $("#login-button");
    const errBox = $("#login-error");
    errBox.classList.add("hidden");
    btn.disabled = true;
    btn.textContent = "Connexion…";
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      errBox.textContent = "Échec de la connexion. Vérifiez vos identifiants.";
      errBox.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "Se connecter";
    }
  });

  $("#logout-button").addEventListener("click", async () => {
    await signOut(auth);
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    $("#login-screen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#user-email").textContent = user.email;
    demarrerObservateurs();
    handleRoute();
    verifierAnniversairesAuDemarrage();
  } else {
    $("#app").classList.add("hidden");
    $("#login-screen").classList.remove("hidden");
    arreterObservateurs();
  }
});

// ============================================================
// OBSERVATEURS FIRESTORE (synchro temps réel)
// ============================================================
function demarrerObservateurs() {
  const qMembres = query(collection(db, "members"), orderBy("nom", "asc"));
  state.unsubMembres = onSnapshot(qMembres,
    (snap) => {
      state.membres = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      reRenderSiNecessaire();
    },
    (err) => console.error("Erreur observation membres :", err)
  );

  const qGroupes = query(collection(db, "groups"), orderBy("nom", "asc"));
  state.unsubGroupes = onSnapshot(qGroupes,
    (snap) => {
      state.groupes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      reRenderSiNecessaire();
    },
    (err) => console.error("Erreur observation groupes :", err)
  );

  state.unsubPresences = onSnapshot(collection(db, "attendance"),
    (snap) => {
      state.presences = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      reRenderSiNecessaire();
    },
    (err) => console.error("Erreur observation présences :", err)
  );
}

function arreterObservateurs() {
  if (state.unsubMembres) state.unsubMembres();
  if (state.unsubGroupes) state.unsubGroupes();
  if (state.unsubPresences) state.unsubPresences();
}

function reRenderSiNecessaire() {
  // On re-rend la page courante chaque fois que les données changent
  handleRoute();
}

// ============================================================
// ROUTAGE PAR HASH
// ============================================================
window.addEventListener("hashchange", handleRoute);

function handleRoute() {
  if (!auth.currentUser) return;
  const hash = window.location.hash.slice(1) || "/membres";
  const parts = hash.split("/").filter(Boolean);

  // Activer le bon onglet
  $$(".nav-item").forEach(a => a.classList.remove("active"));
  const tab = parts[0];
  const navItem = document.querySelector(`.nav-item[data-route="${tab}"]`);
  if (navItem) navItem.classList.add("active");

  const container = $("#page-content");

  switch (parts[0]) {
    case "membres":
      if (parts[1] === "nouveau") return renderFormMembre(container, null);
      if (parts[1] && parts[2] === "edit") return renderFormMembre(container, parts[1]);
      if (parts[1]) return renderDetailMembre(container, parts[1]);
      return renderListeMembres(container);

    case "groupes":
      if (parts[1] === "nouveau") return renderFormGroupe(container, null);
      if (parts[1] && parts[2] === "edit") return renderFormGroupe(container, parts[1]);
      if (parts[1]) return renderDetailGroupe(container, parts[1]);
      return renderListeGroupes(container);

    case "stats":
      return renderStats(container);

    case "parametres":
      return renderParametres(container);

    default:
      window.location.hash = "#/membres";
  }
}

// ============================================================
// PAGE : LISTE DES MEMBRES
// ============================================================
function renderListeMembres(container) {
  const filtre = state.recherche.toLowerCase();
  const liste = state.membres.filter(m => {
    if (!filtre) return true;
    return nomComplet(m).toLowerCase().includes(filtre)
      || (m.telephone || "").includes(filtre)
      || (m.email || "").toLowerCase().includes(filtre)
      || (m.role || "").toLowerCase().includes(filtre);
  });

  container.innerHTML = `
    <div class="page-header">
      <h1>Registre des Membres</h1>
      <div class="actions-row">
        <button class="btn-secondary" onclick="window.location.hash='#/membres/nouveau'">+ Nouveau membre</button>
      </div>
    </div>
    <div class="search-bar">
      <input type="text" id="recherche-membres" placeholder="Rechercher par nom, téléphone, email, rôle…" value="${escapeHtml(state.recherche)}">
    </div>
    <p style="color:var(--gris-texte); margin-bottom:12px;">${liste.length} membre(s)</p>
    ${liste.length === 0 ? `<div class="empty-state">${filtre ? "Aucun résultat" : "Aucun membre enregistré. Cliquez sur + pour commencer."}</div>` : `
    <div class="list-card">
      ${liste.map(m => `
        <div class="list-item" data-id="${m.id}">
          <div class="avatar">${initiales(m)}</div>
          <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(nomComplet(m))}</div>
            <div class="list-item-role">${escapeHtml(m.role || "Fidèle")} ${regulariteHTML(m.regularite)}</div>
            ${m.telephone ? `<div class="list-item-subtitle">${escapeHtml(m.telephone)}</div>` : ""}
          </div>
          <span class="chevron">›</span>
        </div>
      `).join("")}
    </div>`}
  `;

  $("#recherche-membres").addEventListener("input", (e) => {
    state.recherche = e.target.value;
    renderListeMembres(container);
  });

  $$(".list-item[data-id]").forEach(el => {
    el.addEventListener("click", () => {
      window.location.hash = `#/membres/${el.dataset.id}`;
    });
  });
}

// ============================================================
// PAGE : FORMULAIRE MEMBRE
// ============================================================
function renderFormMembre(container, memberId) {
  const modeEdition = !!memberId;
  const m = modeEdition
    ? (state.membres.find(x => x.id === memberId) || vide())
    : vide();

  function vide() {
    return {
      nom: "", prenom: "", telephone: "", email: "",
      adresse: "", ville: "", codePostal: "",
      dateNaissance: "", role: "Fidèle",
      statutMatrimonial: "Célibataire", regularite: "Actif",
      groupIds: [], notes: ""
    };
  }

  container.innerHTML = `
    <div class="page-header">
      <h1>${modeEdition ? "Modifier le membre" : "Nouveau membre"}</h1>
      <button class="btn-outline" onclick="history.back()">← Retour</button>
    </div>
    <div class="form-card">
      <form id="form-membre">
        <div class="form-row">
          <div class="form-group">
            <label>Prénom</label>
            <input type="text" name="prenom" value="${escapeHtml(m.prenom)}" required>
          </div>
          <div class="form-group">
            <label>Nom</label>
            <input type="text" name="nom" value="${escapeHtml(m.nom)}" required>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Téléphone</label>
            <input type="tel" name="telephone" value="${escapeHtml(m.telephone)}">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" name="email" value="${escapeHtml(m.email)}">
          </div>
        </div>

        <div class="form-group">
          <label>Adresse</label>
          <input type="text" name="adresse" value="${escapeHtml(m.adresse)}">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Ville</label>
            <input type="text" name="ville" value="${escapeHtml(m.ville)}">
          </div>
          <div class="form-group">
            <label>Code postal</label>
            <input type="text" name="codePostal" value="${escapeHtml(m.codePostal)}">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Date de naissance (AAAA-MM-JJ)</label>
            <input type="text" name="dateNaissance" value="${escapeHtml(m.dateNaissance)}" placeholder="1980-05-15">
          </div>
          <div class="form-group">
            <label>Rôle dans le ministère</label>
            <select name="role">
              ${ROLES_MINISTERE.map(r => `<option ${r === m.role ? "selected" : ""}>${r}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Statut matrimonial</label>
            <select name="statutMatrimonial">
              ${STATUTS_MATRIMONIAUX.map(s => `<option ${s === m.statutMatrimonial ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label>Régularité</label>
            <select name="regularite">
              ${REGULARITES.map(r => `<option ${r === m.regularite ? "selected" : ""}>${r}</option>`).join("")}
            </select>
          </div>
        </div>

        ${state.groupes.length > 0 ? `
        <div class="form-group">
          <label>Groupes</label>
          <div class="member-checkbox-list">
            ${state.groupes.map(g => `
              <label class="member-checkbox-item">
                <input type="checkbox" name="groupes" value="${g.id}" ${(m.groupIds || []).includes(g.id) ? "checked" : ""}>
                <span class="group-color-dot" style="background:${g.couleurHex || "#D4A24A"}"></span>
                <span>${escapeHtml(g.nom)}</span>
              </label>
            `).join("")}
          </div>
        </div>` : ""}

        <div class="form-group">
          <label>Notes</label>
          <textarea name="notes" rows="3">${escapeHtml(m.notes)}</textarea>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn-secondary">${modeEdition ? "Enregistrer" : "Ajouter le membre"}</button>
          <button type="button" class="btn-outline" onclick="history.back()">Annuler</button>
        </div>
      </form>
    </div>
  `;

  $("#form-membre").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      nom: fd.get("nom").trim(),
      prenom: fd.get("prenom").trim(),
      telephone: fd.get("telephone").trim(),
      email: fd.get("email").trim(),
      adresse: fd.get("adresse").trim(),
      ville: fd.get("ville").trim(),
      codePostal: fd.get("codePostal").trim(),
      dateNaissance: fd.get("dateNaissance").trim(),
      role: fd.get("role"),
      statutMatrimonial: fd.get("statutMatrimonial"),
      regularite: fd.get("regularite"),
      groupIds: Array.from(fd.getAll("groupes")),
      notes: fd.get("notes").trim(),
      // Photo : non gérée côté web pour rester compatible Android (stockage local)
      photoUrl: m.photoUrl || ""
    };

    try {
      if (modeEdition) {
        await setDoc(doc(db, "members", memberId), { ...data, id: memberId, dateAdhesion: m.dateAdhesion || Date.now() });
        toast("Modifications enregistrées", "success");
      } else {
        const docRef = await addDoc(collection(db, "members"), { ...data, dateAdhesion: Date.now() });
        await setDoc(docRef, { ...data, id: docRef.id, dateAdhesion: Date.now() });
        toast("Membre ajouté", "success");
      }
      window.location.hash = "#/membres";
    } catch (err) {
      console.error(err);
      toast("Erreur : " + err.message, "error");
    }
  });
}

// ============================================================
// PAGE : DÉTAIL MEMBRE
// ============================================================
function renderDetailMembre(container, memberId) {
  const m = state.membres.find(x => x.id === memberId);
  if (!m) {
    container.innerHTML = `<p>Membre introuvable.</p>`;
    return;
  }

  const nomsGroupes = (m.groupIds || [])
    .map(id => state.groupes.find(g => g.id === id)?.nom)
    .filter(Boolean);

  const presencesMembre = state.presences
    .filter(p => p.memberId === memberId)
    .sort((a, b) => b.date - a.date);

  container.innerHTML = `
    <div class="page-header">
      <button class="btn-outline" onclick="history.back()">← Retour</button>
      <div class="actions-row">
        <button class="btn-secondary" id="btn-pdf">📄 PDF</button>
        <button onclick="window.location.hash='#/membres/${memberId}/edit'">✏️ Modifier</button>
        <button class="btn-danger" id="btn-supprimer">🗑️ Supprimer</button>
      </div>
    </div>

    <div class="form-card">
      <div class="detail-header">
        <div class="detail-avatar">${initiales(m)}</div>
        <div>
          <div class="detail-name">${escapeHtml(nomComplet(m))}</div>
          <div class="detail-role">${escapeHtml(m.role || "Fidèle")} ${regulariteHTML(m.regularite)}</div>
        </div>
      </div>

      ${champDetail("Téléphone", m.telephone)}
      ${champDetail("Email", m.email)}
      ${champDetail("Adresse", [m.adresse, [m.codePostal, m.ville].filter(Boolean).join(" ")].filter(Boolean).join(", "))}
      ${champDetail("Date de naissance", m.dateNaissance)}
      ${champDetail("Statut matrimonial", m.statutMatrimonial)}
      ${champDetail("Régularité", m.regularite)}
      ${nomsGroupes.length > 0 ? champDetail("Groupes", nomsGroupes.join(", ")) : ""}
      ${m.notes ? champDetail("Notes", m.notes) : ""}
    </div>

    <h2 class="section-title">Historique de présence</h2>
    <div class="form-card">
      <button class="btn-secondary" id="btn-ajouter-presence" style="margin-bottom:12px">+ Enregistrer une présence</button>
      ${presencesMembre.length === 0 ? `<p style="color:var(--gris-texte)">Aucune présence enregistrée.</p>` : presencesMembre.map(p => `
        <div class="attendance-item">
          <span class="attendance-icon">${p.present ? "✅" : "❌"}</span>
          <div class="attendance-content">
            <div class="attendance-type">${escapeHtml(p.typeEvenement || "")}</div>
            <div class="attendance-date">${new Date(p.date).toLocaleDateString("fr-FR")} ${p.notes ? "— " + escapeHtml(p.notes) : ""}</div>
          </div>
          <button class="btn-link" style="color:var(--rouge)" data-presence-id="${p.id}">🗑️</button>
        </div>
      `).join("")}
    </div>
  `;

  $("#btn-pdf").addEventListener("click", async () => {
    await PDF.genererFicheMembre(
      { ...m, nomComplet: nomComplet(m) },
      nomsGroupes
    );
  });

  $("#btn-supprimer").addEventListener("click", () => {
    if (confirm(`Supprimer définitivement ${nomComplet(m)} ? Cette action est irréversible.`)) {
      deleteDoc(doc(db, "members", memberId))
        .then(() => {
          toast("Membre supprimé", "success");
          window.location.hash = "#/membres";
        })
        .catch(err => toast("Erreur : " + err.message, "error"));
    }
  });

  $("#btn-ajouter-presence").addEventListener("click", () => {
    dialogueAjoutPresence(memberId);
  });

  $$("[data-presence-id]").forEach(b => {
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("Supprimer cette présence ?")) {
        await deleteDoc(doc(db, "attendance", b.dataset.presenceId));
        toast("Présence supprimée", "success");
      }
    });
  });
}

function champDetail(label, valeur) {
  if (!valeur) return "";
  return `
    <div class="detail-field">
      <div class="detail-field-label">${escapeHtml(label)}</div>
      <div class="detail-field-value">${escapeHtml(valeur)}</div>
    </div>
  `;
}

function dialogueAjoutPresence(memberId) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h2>Enregistrer une présence</h2>
      <div class="form-group">
        <label>Type d'événement</label>
        <select id="presence-type">${TYPES_EVENEMENT.map(t => `<option>${t}</option>`).join("")}</select>
      </div>
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="presence-date" value="${new Date().toISOString().slice(0, 10)}">
      </div>
      <div class="form-group">
        <label><input type="checkbox" id="presence-present" checked> Présent(e)</label>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea id="presence-notes" rows="2"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn-outline" id="presence-annuler">Annuler</button>
        <button class="btn-secondary" id="presence-valider">Enregistrer</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  $("#presence-annuler").addEventListener("click", () => backdrop.remove());
  $("#presence-valider").addEventListener("click", async () => {
    const data = {
      memberId,
      typeEvenement: $("#presence-type").value,
      date: new Date($("#presence-date").value).getTime(),
      present: $("#presence-present").checked,
      notes: $("#presence-notes").value.trim()
    };
    try {
      const ref = await addDoc(collection(db, "attendance"), data);
      await setDoc(ref, { ...data, id: ref.id });
      toast("Présence enregistrée", "success");
      backdrop.remove();
    } catch (err) {
      toast("Erreur : " + err.message, "error");
    }
  });
}

// ============================================================
// PAGE : LISTE DES GROUPES
// ============================================================
function renderListeGroupes(container) {
  const filtre = state.rechercheGroupes.toLowerCase();
  const liste = state.groupes.filter(g => {
    if (!filtre) return true;
    return (g.nom || "").toLowerCase().includes(filtre)
      || (g.typeGroupe || "").toLowerCase().includes(filtre)
      || (g.responsableNom || "").toLowerCase().includes(filtre)
      || (g.lieu || "").toLowerCase().includes(filtre);
  });

  container.innerHTML = `
    <div class="page-header">
      <h1>Groupes et cellules</h1>
      <button class="btn-secondary" onclick="window.location.hash='#/groupes/nouveau'">+ Nouveau groupe</button>
    </div>
    <div class="search-bar">
      <input type="text" id="recherche-groupes" placeholder="Rechercher un groupe…" value="${escapeHtml(state.rechercheGroupes)}">
    </div>
    ${liste.length === 0 ? `<div class="empty-state">${filtre ? "Aucun résultat" : "Aucun groupe. Cliquez sur + pour en créer un."}</div>` : `
    <div class="list-card">
      ${liste.map(g => {
        const nbMembres = state.membres.filter(m => (m.groupIds || []).includes(g.id)).length;
        return `
        <div class="list-item" data-id="${g.id}">
          <div class="avatar" style="background:${g.couleurHex || "#D4A24A"}; color:white">🏷️</div>
          <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(g.nom)}</div>
            <div class="list-item-subtitle">${escapeHtml(g.typeGroupe || "")}</div>
            <div class="list-item-subtitle">${nbMembres} membre(s)${g.jourReunion ? " • " + escapeHtml(g.jourReunion) : ""}</div>
          </div>
          <span class="chevron">›</span>
        </div>`;
      }).join("")}
    </div>`}
  `;

  $("#recherche-groupes").addEventListener("input", (e) => {
    state.rechercheGroupes = e.target.value;
    renderListeGroupes(container);
  });

  $$(".list-item[data-id]").forEach(el => {
    el.addEventListener("click", () => {
      window.location.hash = `#/groupes/${el.dataset.id}`;
    });
  });
}

// ============================================================
// PAGE : FORMULAIRE GROUPE
// ============================================================
function renderFormGroupe(container, groupId) {
  const modeEdition = !!groupId;
  const g = modeEdition
    ? (state.groupes.find(x => x.id === groupId) || vide())
    : vide();

  function vide() {
    return {
      nom: "", description: "", responsableId: "", responsableNom: "",
      couleurHex: "#D4A24A", typeGroupe: "Cellule de maison",
      lieu: "", jourReunion: ""
    };
  }

  container.innerHTML = `
    <div class="page-header">
      <h1>${modeEdition ? "Modifier le groupe" : "Nouveau groupe"}</h1>
      <button class="btn-outline" onclick="history.back()">← Retour</button>
    </div>
    <div class="form-card">
      <form id="form-groupe">
        <div class="form-group">
          <label>Nom du groupe</label>
          <input type="text" name="nom" value="${escapeHtml(g.nom)}" required>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Type de groupe</label>
            <select name="typeGroupe">
              ${TYPES_GROUPE.map(t => `<option ${t === g.typeGroupe ? "selected" : ""}>${t}</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label>Responsable</label>
            <select name="responsableId">
              <option value="">— Aucun —</option>
              ${state.membres.map(m => `<option value="${m.id}" ${m.id === g.responsableId ? "selected" : ""}>${escapeHtml(nomComplet(m))}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Jour et heure de réunion</label>
            <input type="text" name="jourReunion" value="${escapeHtml(g.jourReunion)}" placeholder="Ex : Vendredi 19h">
          </div>
          <div class="form-group">
            <label>Lieu</label>
            <input type="text" name="lieu" value="${escapeHtml(g.lieu)}">
          </div>
        </div>

        <div class="form-group">
          <label>Description</label>
          <textarea name="description" rows="3">${escapeHtml(g.description)}</textarea>
        </div>

        <div class="form-group">
          <label>Couleur du groupe</label>
          <div class="color-palette" id="palette-couleurs">
            ${COULEURS_GROUPE.map(c => `
              <div class="color-swatch ${c === g.couleurHex ? "selected" : ""}" style="background:${c}" data-color="${c}"></div>
            `).join("")}
          </div>
          <input type="hidden" name="couleurHex" value="${g.couleurHex}">
        </div>

        <div class="form-actions">
          <button type="submit" class="btn-secondary">${modeEdition ? "Enregistrer" : "Créer le groupe"}</button>
          <button type="button" class="btn-outline" onclick="history.back()">Annuler</button>
        </div>
      </form>
    </div>
  `;

  $$("#palette-couleurs .color-swatch").forEach(s => {
    s.addEventListener("click", () => {
      $$("#palette-couleurs .color-swatch").forEach(x => x.classList.remove("selected"));
      s.classList.add("selected");
      $("input[name=couleurHex]").value = s.dataset.color;
    });
  });

  $("#form-groupe").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const responsableId = fd.get("responsableId");
    const responsable = state.membres.find(m => m.id === responsableId);
    const data = {
      nom: fd.get("nom").trim(),
      description: fd.get("description").trim(),
      responsableId: responsableId || "",
      responsableNom: responsable ? nomComplet(responsable) : "",
      couleurHex: fd.get("couleurHex"),
      typeGroupe: fd.get("typeGroupe"),
      lieu: fd.get("lieu").trim(),
      jourReunion: fd.get("jourReunion").trim()
    };

    try {
      if (modeEdition) {
        await setDoc(doc(db, "groups", groupId), { ...data, id: groupId, dateCreation: g.dateCreation || Date.now() });
        toast("Modifications enregistrées", "success");
      } else {
        const ref = await addDoc(collection(db, "groups"), { ...data, dateCreation: Date.now() });
        await setDoc(ref, { ...data, id: ref.id, dateCreation: Date.now() });
        toast("Groupe créé", "success");
      }
      window.location.hash = "#/groupes";
    } catch (err) {
      toast("Erreur : " + err.message, "error");
    }
  });
}

// ============================================================
// PAGE : DÉTAIL GROUPE
// ============================================================
function renderDetailGroupe(container, groupId) {
  const g = state.groupes.find(x => x.id === groupId);
  if (!g) {
    container.innerHTML = `<p>Groupe introuvable.</p>`;
    return;
  }
  const membresDuGroupe = state.membres.filter(m => (m.groupIds || []).includes(groupId));

  container.innerHTML = `
    <div class="page-header">
      <button class="btn-outline" onclick="history.back()">← Retour</button>
      <div class="actions-row">
        <button class="btn-secondary" id="btn-pdf-groupe">📄 PDF</button>
        <button id="btn-gerer-membres">👥 Gérer les membres</button>
        <button onclick="window.location.hash='#/groupes/${groupId}/edit'">✏️ Modifier</button>
        <button class="btn-danger" id="btn-supprimer-groupe">🗑️ Supprimer</button>
      </div>
    </div>

    <div class="form-card">
      <div style="background:${g.couleurHex || "#D4A24A"}; color:white; padding:20px; border-radius:10px; text-align:center; margin-bottom:20px">
        <h2 style="margin:0">${escapeHtml(g.nom)}</h2>
      </div>
      ${champDetail("Type", g.typeGroupe)}
      ${champDetail("Responsable", g.responsableNom)}
      ${champDetail("Réunion", g.jourReunion)}
      ${champDetail("Lieu", g.lieu)}
      ${champDetail("Description", g.description)}
    </div>

    <h2 class="section-title">Membres du groupe (${membresDuGroupe.length})</h2>
    <div class="form-card">
      ${membresDuGroupe.length === 0 ? `<p style="color:var(--gris-texte)">Aucun membre dans ce groupe.</p>` : `
      <div class="list-card">
        ${membresDuGroupe.map(m => `
          <div class="list-item" data-membre-id="${m.id}">
            <div class="avatar">${initiales(m)}</div>
            <div class="list-item-content">
              <div class="list-item-title">${escapeHtml(nomComplet(m))}</div>
              <div class="list-item-role">${escapeHtml(m.role || "Fidèle")} ${regulariteHTML(m.regularite)}</div>
            </div>
          </div>
        `).join("")}
      </div>`}
    </div>
  `;

  $("#btn-pdf-groupe").addEventListener("click", async () => {
    await PDF.genererFicheGroupe(
      g,
      membresDuGroupe.map(m => ({ ...m, nomComplet: nomComplet(m) }))
    );
  });

  $("#btn-supprimer-groupe").addEventListener("click", () => {
    if (confirm(`Supprimer le groupe "${g.nom}" ? Les membres ne seront pas supprimés.`)) {
      deleteDoc(doc(db, "groups", groupId))
        .then(() => {
          toast("Groupe supprimé", "success");
          window.location.hash = "#/groupes";
        });
    }
  });

  $("#btn-gerer-membres").addEventListener("click", () => dialogueGererMembres(groupId));

  $$("[data-membre-id]").forEach(el => {
    el.addEventListener("click", () => {
      window.location.hash = `#/membres/${el.dataset.membreId}`;
    });
  });
}

function dialogueGererMembres(groupId) {
  const dans = new Set();
  state.membres.forEach(m => {
    if ((m.groupIds || []).includes(groupId)) dans.add(m.id);
  });

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h2>Sélectionner les membres</h2>
      <div class="member-checkbox-list">
        ${state.membres.map(m => `
          <label class="member-checkbox-item">
            <input type="checkbox" value="${m.id}" ${dans.has(m.id) ? "checked" : ""}>
            <span>${escapeHtml(nomComplet(m))}</span>
          </label>
        `).join("")}
      </div>
      <div class="modal-actions">
        <button class="btn-outline" id="cancel">Annuler</button>
        <button class="btn-secondary" id="ok">Valider</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  $("#cancel").addEventListener("click", () => backdrop.remove());
  $("#ok").addEventListener("click", async () => {
    const cochees = new Set();
    backdrop.querySelectorAll("input[type=checkbox]:checked").forEach(c => cochees.add(c.value));
    try {
      const promises = [];
      for (const m of state.membres) {
        const veutDans = cochees.has(m.id);
        const estDans = (m.groupIds || []).includes(groupId);
        if (veutDans !== estDans) {
          const nouveaux = veutDans
            ? [...(m.groupIds || []), groupId]
            : (m.groupIds || []).filter(id => id !== groupId);
          promises.push(setDoc(doc(db, "members", m.id), { ...m, groupIds: nouveaux }));
        }
      }
      await Promise.all(promises);
      toast("Membres mis à jour", "success");
      backdrop.remove();
    } catch (err) {
      toast("Erreur : " + err.message, "error");
    }
  });
}

// ============================================================
// PAGE : STATISTIQUES
// ============================================================
function bornesPeriode() {
  const now = new Date();
  let debut, fin;
  switch (state.filtreType) {
    case "SEMAINE":
      const d = new Date(now);
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      d.setHours(0, 0, 0, 0);
      debut = d.getTime();
      fin = debut + 7 * 86400000;
      break;
    case "MOIS":
      debut = new Date(state.filtreAnnee, state.filtreMois, 1).getTime();
      fin = new Date(state.filtreAnnee, state.filtreMois + 1, 1).getTime();
      break;
    case "ANNEE":
      debut = new Date(state.filtreAnnee, 0, 1).getTime();
      fin = new Date(state.filtreAnnee + 1, 0, 1).getTime();
      break;
    case "TOUT":
    default:
      debut = 0; fin = Number.MAX_SAFE_INTEGER;
  }
  return [debut, fin];
}

function labelPeriode() {
  switch (state.filtreType) {
    case "SEMAINE": return "Cette semaine";
    case "MOIS": return `${MOIS_LABELS[state.filtreMois]} ${state.filtreAnnee}`;
    case "ANNEE": return `Année ${state.filtreAnnee}`;
    case "TOUT": return "Depuis le début";
  }
}

function calculerStats() {
  const now = new Date();
  const moisCourant = now.getMonth();
  const anneeCourante = now.getFullYear();

  const nbMoisCourant = state.presences.filter(p => {
    if (!p.present) return false;
    const d = new Date(p.date);
    return d.getMonth() === moisCourant && d.getFullYear() === anneeCourante;
  }).length;

  const ilYa90j = Date.now() - 90 * 86400000;
  const presencesRecentes = state.presences.filter(p => p.date >= ilYa90j);
  const taux = presencesRecentes.length > 0
    ? presencesRecentes.filter(p => p.present).length / presencesRecentes.length
    : 0;

  const compterPar = (arr, key) => {
    const m = new Map();
    arr.forEach(x => m.set(x[key], (m.get(x[key]) || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  };

  const parRole = compterPar(state.membres, "role");
  const parType = compterPar(state.presences.filter(p => p.present), "typeEvenement");

  const compteurMembres = new Map();
  presencesRecentes.filter(p => p.present).forEach(p => {
    compteurMembres.set(p.memberId, (compteurMembres.get(p.memberId) || 0) + 1);
  });
  const topAssidus = Array.from(compteurMembres.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => {
      const m = state.membres.find(x => x.id === id);
      return [m ? nomComplet(m) : "(supprimé)", count];
    });

  const [debut, fin] = bornesPeriode();
  const inscrits = state.membres.filter(m =>
    m.dateAdhesion && m.dateAdhesion >= debut && m.dateAdhesion < fin
  );

  return {
    totalMembres: state.membres.length,
    nbMoisCourant, taux, parRole, parType, topAssidus,
    nbInscritsPeriode: inscrits.length,
    listeInscrits: inscrits
  };
}

function renderStats(container) {
  const s = calculerStats();

  container.innerHTML = `
    <div class="page-header">
      <h1>Statistiques</h1>
      <button class="btn-secondary" id="btn-export-pdf">📄 Télécharger le rapport en PDF</button>
    </div>

    <h2 class="section-title">Filtrer par période</h2>
    <div class="filter-chips" id="chips-type">
      <div class="chip ${state.filtreType === "SEMAINE" ? "active" : ""}" data-type="SEMAINE">Cette semaine</div>
      <div class="chip ${state.filtreType === "MOIS" ? "active" : ""}" data-type="MOIS">Un mois précis</div>
      <div class="chip ${state.filtreType === "ANNEE" ? "active" : ""}" data-type="ANNEE">Une année précise</div>
      <div class="chip ${state.filtreType === "TOUT" ? "active" : ""}" data-type="TOUT">Depuis le début</div>
    </div>

    ${state.filtreType === "MOIS" ? `
    <div class="form-row" style="max-width:480px; margin-bottom:16px">
      <div class="form-group">
        <label>Mois</label>
        <select id="filtre-mois">
          ${MOIS_LABELS.map((m, i) => `<option value="${i}" ${i === state.filtreMois ? "selected" : ""}>${m}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label>Année</label>
        <select id="filtre-annee">
          ${ANNEES_DISPO.map(a => `<option ${a === state.filtreAnnee ? "selected" : ""}>${a}</option>`).join("")}
        </select>
      </div>
    </div>` : ""}

    ${state.filtreType === "ANNEE" ? `
    <div class="form-group" style="max-width:240px; margin-bottom:16px">
      <label>Année</label>
      <select id="filtre-annee">
        ${ANNEES_DISPO.map(a => `<option ${a === state.filtreAnnee ? "selected" : ""}>${a}</option>`).join("")}
      </select>
    </div>` : ""}

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">➕</div>
        <div class="stat-value">${s.nbInscritsPeriode}</div>
        <div class="stat-label">Inscrits — ${labelPeriode().toLowerCase()}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-value">${s.totalMembres}</div>
        <div class="stat-label">Total membres</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-value">${s.nbMoisCourant}</div>
        <div class="stat-label">Présences ce mois</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📈</div>
        <div class="stat-value">${Math.round(s.taux * 100)} %</div>
        <div class="stat-label">Taux de présence (90 j)</div>
      </div>
    </div>

    ${s.parType.length > 0 ? `
    <h2 class="section-title">Par type d'événement</h2>
    <div class="section-card">
      ${barresHorizontales(s.parType.slice(0, 7), true)}
    </div>` : ""}

    ${s.parRole.length > 0 ? `
    <h2 class="section-title">Membres par rôle</h2>
    <div class="section-card">
      ${barresHorizontales(s.parRole, false)}
    </div>` : ""}

    ${s.topAssidus.length > 0 ? `
    <h2 class="section-title">Membres les plus assidus (90 jours)</h2>
    <div class="section-card">
      ${s.topAssidus.map(([nom, count], i) => {
        const medaille = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
        return `<div style="display:flex; padding:8px 0; align-items:center;">
          <span style="width:30px">${medaille}</span>
          <span style="flex:1">${escapeHtml(nom)}</span>
          <span style="color:var(--or-fonce); font-weight:600">${count} présences</span>
        </div>`;
      }).join("")}
    </div>` : ""}
  `;

  $$("#chips-type .chip").forEach(c => {
    c.addEventListener("click", () => {
      state.filtreType = c.dataset.type;
      renderStats(container);
    });
  });

  const fMois = $("#filtre-mois");
  if (fMois) fMois.addEventListener("change", (e) => {
    state.filtreMois = Number(e.target.value);
    renderStats(container);
  });

  const fAnnee = $("#filtre-annee");
  if (fAnnee) fAnnee.addEventListener("change", (e) => {
    state.filtreAnnee = Number(e.target.value);
    renderStats(container);
  });

  $("#btn-export-pdf").addEventListener("click", async () => {
    await PDF.genererRapportStats({
      titrePeriode: labelPeriode(),
      nbInscritsPeriode: s.nbInscritsPeriode,
      totalMembres: s.totalMembres,
      presencesMois: s.nbMoisCourant,
      tauxPresence: Math.round(s.taux * 100),
      parRole: s.parRole,
      parTypeEvenement: s.parType,
      topAssidus: s.topAssidus,
      listeInscrits: s.listeInscrits.map(m => ({ ...m, nomComplet: nomComplet(m) }))
    });
  });
}

function barresHorizontales(donnees, secondary) {
  if (donnees.length === 0) return "";
  const max = Math.max(...donnees.map(d => d[1]));
  return donnees.map(([label, valeur]) => {
    const ratio = max > 0 ? (valeur / max) * 100 : 0;
    return `
    <div class="bar-row">
      <div class="bar-row-header">
        <span>${escapeHtml(label)}</span>
        <strong>${valeur}</strong>
      </div>
      <div class="bar-bg"><div class="bar-fill ${secondary ? "bar-fill-secondary" : ""}" style="width:${ratio}%"></div></div>
    </div>`;
  }).join("");
}

// ============================================================
// PAGE : PARAMÈTRES
// ============================================================
function renderParametres(container) {
  container.innerHTML = `
    <div class="page-header"><h1>Paramètres</h1></div>

    <div class="settings-section">
      <div class="settings-section-title">Export des données</div>
      <div class="settings-item" id="exp-membres">
        <span class="settings-icon">⬇️</span>
        <div class="settings-text">
          <div class="settings-title">Exporter la liste des membres</div>
          <div class="settings-subtitle">Fichier CSV ouvrable dans Excel</div>
        </div>
      </div>
      <div class="settings-item" id="exp-presences">
        <span class="settings-icon">📅</span>
        <div class="settings-text">
          <div class="settings-title">Exporter l'historique des présences</div>
          <div class="settings-subtitle">Fichier CSV ouvrable dans Excel</div>
        </div>
      </div>
      <div class="settings-item" id="exp-groupes">
        <span class="settings-icon">🏷️</span>
        <div class="settings-text">
          <div class="settings-title">Exporter la liste des groupes</div>
          <div class="settings-subtitle">Avec les membres affectés à chaque groupe</div>
        </div>
      </div>
      <div class="settings-item" id="exp-roles">
        <span class="settings-icon">📋</span>
        <div class="settings-text">
          <div class="settings-title">Exporter les membres par rôle</div>
          <div class="settings-subtitle">Pasteurs, choristes, diacres, etc.</div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Synchronisation</div>
      <div class="settings-item" style="cursor:default">
        <span class="settings-icon">☁️</span>
        <div class="settings-text">
          <div class="settings-title">Connecté à Firebase</div>
          <div class="settings-subtitle">Projet : ministere-lumiere — synchro temps réel active</div>
        </div>
      </div>
    </div>

    <p style="text-align:center; color:var(--gris-texte); margin-top:32px; font-size:12px">
      Ministère Maison de Lumière du Canada<br>
      Application Web — synchronisée avec l'app Android
    </p>
  `;

  $("#exp-membres").addEventListener("click", exporterMembres);
  $("#exp-presences").addEventListener("click", exporterPresences);
  $("#exp-groupes").addEventListener("click", exporterGroupes);
  $("#exp-roles").addEventListener("click", exporterParRole);
}

// ============================================================
// EXPORTS CSV
// ============================================================
function csv(s) {
  if (s == null) return "";
  s = String(s);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function telecharger(contenu, nomFichier) {
  // BOM UTF-8 pour qu'Excel reconnaisse les accents
  const blob = new Blob(["\uFEFF" + contenu], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  a.click();
  URL.revokeObjectURL(url);
}

function dateFichier() {
  return new Date().toISOString().slice(0, 10);
}

function exporterMembres() {
  const mapGroupes = new Map(state.groupes.map(g => [g.id, g.nom]));
  const lignes = ["Prénom,Nom,Téléphone,Email,Adresse,Ville,Code postal,Date de naissance,Rôle,Statut matrimonial,Régularité,Groupes,Notes"];
  for (const m of state.membres) {
    const noms = (m.groupIds || []).map(id => mapGroupes.get(id)).filter(Boolean).join(" / ");
    lignes.push([
      csv(m.prenom), csv(m.nom), csv(m.telephone), csv(m.email),
      csv(m.adresse), csv(m.ville), csv(m.codePostal), csv(m.dateNaissance),
      csv(m.role), csv(m.statutMatrimonial), csv(m.regularite),
      csv(noms), csv(m.notes)
    ].join(","));
  }
  telecharger(lignes.join("\n"), `membres-mmlc-${dateFichier()}.csv`);
  toast(`${state.membres.length} membres exportés`, "success");
}

function exporterPresences() {
  const mapMembres = new Map(state.membres.map(m => [m.id, nomComplet(m)]));
  const lignes = ["Date,Membre,Type d'événement,Présent,Notes"];
  const triees = [...state.presences].sort((a, b) => b.date - a.date);
  for (const p of triees) {
    const date = new Date(p.date).toISOString().slice(0, 10);
    lignes.push([
      csv(date),
      csv(mapMembres.get(p.memberId) || "(membre supprimé)"),
      csv(p.typeEvenement),
      csv(p.present ? "Oui" : "Non"),
      csv(p.notes)
    ].join(","));
  }
  telecharger(lignes.join("\n"), `presences-mmlc-${dateFichier()}.csv`);
  toast(`${triees.length} présences exportées`, "success");
}

function exporterGroupes() {
  const lignes = ["Nom du groupe,Type,Responsable,Lieu,Jour de réunion,Description,Nombre de membres,Membres"];
  for (const g of state.groupes) {
    const membres = state.membres.filter(m => (m.groupIds || []).includes(g.id));
    const noms = membres.map(m => nomComplet(m)).join(" / ");
    lignes.push([
      csv(g.nom), csv(g.typeGroupe), csv(g.responsableNom),
      csv(g.lieu), csv(g.jourReunion), csv(g.description),
      csv(membres.length), csv(noms)
    ].join(","));
  }
  telecharger(lignes.join("\n"), `groupes-mmlc-${dateFichier()}.csv`);
  toast(`${state.groupes.length} groupes exportés`, "success");
}

function exporterParRole() {
  const lignes = ["Rôle,Nom,Téléphone,Email,Régularité"];
  const triees = [...state.membres].sort((a, b) => {
    const r = (a.role || "").localeCompare(b.role || "");
    return r !== 0 ? r : nomComplet(a).localeCompare(nomComplet(b));
  });
  for (const m of triees) {
    lignes.push([
      csv(m.role), csv(nomComplet(m)),
      csv(m.telephone), csv(m.email),
      csv(m.regularite)
    ].join(","));
  }
  telecharger(lignes.join("\n"), `membres-par-role-${dateFichier()}.csv`);
  toast(`${triees.length} membres exportés par rôle`, "success");
}

// ============================================================
// ANNIVERSAIRES AU DÉMARRAGE
// ============================================================
function verifierAnniversairesAuDemarrage() {
  setTimeout(() => {
    const today = new Date();
    const md = String(today.getMonth() + 1).padStart(2, "0") + "-" +
               String(today.getDate()).padStart(2, "0");
    const anniversaires = state.membres.filter(m => moisJourNaissance(m) === md);
    if (anniversaires.length > 0) {
      const noms = anniversaires.map(m => nomComplet(m)).join(", ");
      toast(`🎂 Anniversaire(s) aujourd'hui : ${noms}`, "info");
    }
  }, 2000); // laisse le temps aux données de charger
}

// ============================================================
// DÉMARRAGE
// ============================================================
setupLogin();
