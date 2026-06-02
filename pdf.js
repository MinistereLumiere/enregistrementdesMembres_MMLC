// pdf.js — Génération PDF avec jsPDF
// Reproduit fidèlement la mise en page de l'app Android.

const { jsPDF } = window.jspdf;

const BLEU_NUIT = [26, 41, 66];
const OR = [212, 162, 74];
const GRIS = [100, 100, 100];

// Cache du logo encodé en base64, chargé une fois.
let logoCache = null;

async function chargerLogo() {
  if (logoCache) return logoCache;
  try {
    const response = await fetch("assets/logo_mmlc.png");
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        logoCache = reader.result;
        resolve(logoCache);
      };
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Impossible de charger le logo :", e);
    return null;
  }
}

function dessinerEntete(doc, sousTitre, logoData) {
  if (logoData) {
    doc.addImage(logoData, "PNG", 14, 14, 22, 22);
  }
  doc.setTextColor(...BLEU_NUIT);
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("Ministère Maison de Lumière du Canada", 40, 22);

  doc.setTextColor(...OR);
  doc.setFontSize(11);
  doc.text("Registre des Membres MMLC", 40, 30);

  // Ligne séparatrice
  doc.setDrawColor(220, 220, 220);
  doc.line(14, 42, 196, 42);

  doc.setTextColor(...BLEU_NUIT);
  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text(sousTitre, 14, 52);

  return 60; // Position Y où démarrer le contenu
}

function dessinerPiedDePage(doc) {
  const date = new Date().toLocaleString("fr-FR");
  doc.setTextColor(...GRIS);
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.text("Document généré le " + date, 14, 290);
}

function nouvelleSiNecessaire(doc, y, logoData, sousTitre) {
  if (y > 270) {
    dessinerPiedDePage(doc);
    doc.addPage();
    return dessinerEntete(doc, sousTitre + " (suite)", logoData);
  }
  return y;
}

function nomFichier(texte) {
  return (texte || "document")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ============================================================
// FICHE MEMBRE
// ============================================================
export async function genererFicheMembre(membre, nomsGroupes) {
  const doc = new jsPDF();
  const logoData = await chargerLogo();
  let y = dessinerEntete(doc, "Fiche du membre", logoData);

  doc.setTextColor(...BLEU_NUIT);
  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text(membre.nomComplet || "Sans nom", 14, y);
  y += 8;

  doc.setTextColor(...OR);
  doc.setFontSize(11);
  doc.text(membre.role || "Fidèle", 14, y);
  y += 12;

  const champs = [
    ["Téléphone", membre.telephone],
    ["Email", membre.email],
    ["Adresse", membre.adresse],
    ["Ville", membre.ville],
    ["Code postal", membre.codePostal],
    ["Date de naissance", membre.dateNaissance],
    ["Statut matrimonial", membre.statutMatrimonial],
    ["Régularité", membre.regularite],
    ["Groupes", nomsGroupes.join(", ")],
    ["Notes", membre.notes]
  ];

  for (const [label, valeur] of champs) {
    if (!valeur || valeur === "") continue;
    y = nouvelleSiNecessaire(doc, y, logoData, "Fiche du membre");
    doc.setTextColor(...GRIS);
    doc.setFontSize(9);
    doc.text(label.toUpperCase(), 14, y);
    y += 5;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    const lignes = doc.splitTextToSize(String(valeur), 180);
    doc.text(lignes, 14, y);
    y += lignes.length * 6 + 4;
  }

  dessinerPiedDePage(doc);
  doc.save(`fiche-${nomFichier(membre.nomComplet)}.pdf`);
}

// ============================================================
// FICHE GROUPE
// ============================================================
export async function genererFicheGroupe(groupe, membres) {
  const doc = new jsPDF();
  const logoData = await chargerLogo();
  let y = dessinerEntete(doc, "Fiche du groupe", logoData);

  doc.setTextColor(...BLEU_NUIT);
  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text(groupe.nom || "Sans nom", 14, y);
  y += 8;
  doc.setTextColor(...OR);
  doc.setFontSize(11);
  doc.text(groupe.typeGroupe || "", 14, y);
  y += 12;

  const infos = [
    ["Responsable", groupe.responsableNom],
    ["Jour et heure de réunion", groupe.jourReunion],
    ["Lieu", groupe.lieu],
    ["Description", groupe.description]
  ];

  for (const [label, valeur] of infos) {
    if (!valeur) continue;
    y = nouvelleSiNecessaire(doc, y, logoData, "Fiche du groupe");
    doc.setTextColor(...GRIS);
    doc.setFontSize(9);
    doc.text(label.toUpperCase(), 14, y);
    y += 5;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    const lignes = doc.splitTextToSize(String(valeur), 180);
    doc.text(lignes, 14, y);
    y += lignes.length * 6 + 4;
  }

  y += 4;
  y = nouvelleSiNecessaire(doc, y, logoData, "Fiche du groupe");
  doc.setTextColor(...OR);
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text(`MEMBRES DU GROUPE (${membres.length})`, 14, y);
  y += 8;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  for (const m of membres) {
    y = nouvelleSiNecessaire(doc, y, logoData, "Fiche du groupe");
    const ligne = `${m.nomComplet} — ${m.role}` +
      (m.telephone ? ` — ${m.telephone}` : "");
    doc.text(ligne, 14, y);
    y += 6;
  }

  dessinerPiedDePage(doc);
  doc.save(`groupe-${nomFichier(groupe.nom)}.pdf`);
}

// ============================================================
// RAPPORT STATISTIQUE
// ============================================================
export async function genererRapportStats({
  titrePeriode, nbInscritsPeriode, totalMembres, presencesMois,
  tauxPresence, parRole, parTypeEvenement, topAssidus, listeInscrits
}) {
  const doc = new jsPDF();
  const logoData = await chargerLogo();
  let y = dessinerEntete(doc, `Rapport statistique — ${titrePeriode}`, logoData);

  // Vue d'ensemble
  doc.setTextColor(...OR);
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("VUE D'ENSEMBLE", 14, y);
  y += 8;

  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, "normal");
  doc.setFontSize(11);
  const resume = [
    ["Membres inscrits sur la période", String(nbInscritsPeriode)],
    ["Total de membres", String(totalMembres)],
    ["Présences du mois courant", String(presencesMois)],
    ["Taux de présence (90 j)", `${tauxPresence} %`]
  ];
  for (const [label, valeur] of resume) {
    doc.text(label, 14, y);
    doc.text(valeur, 180, y, { align: "right" });
    y += 7;
  }
  y += 6;

  function section(titre, data) {
    if (!data || data.length === 0) return;
    y = nouvelleSiNecessaire(doc, y, logoData, "Rapport statistique");
    doc.setTextColor(...OR);
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text(titre, 14, y);
    y += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, "normal");
    doc.setFontSize(11);
    for (const [label, valeur] of data) {
      y = nouvelleSiNecessaire(doc, y, logoData, "Rapport statistique");
      doc.text(String(label), 14, y);
      doc.text(String(valeur), 180, y, { align: "right" });
      y += 6;
    }
    y += 6;
  }

  section("MEMBRES PAR RÔLE", parRole);
  section("PRÉSENCES PAR TYPE D'ÉVÉNEMENT", parTypeEvenement);
  section("MEMBRES LES PLUS ASSIDUS (90 JOURS)",
    topAssidus.map(([nom, count], i) => [`${i + 1}. ${nom}`, `${count} présences`])
  );

  // Liste des inscrits sur la période
  if (listeInscrits && listeInscrits.length > 0) {
    y = nouvelleSiNecessaire(doc, y, logoData, "Rapport statistique");
    doc.setTextColor(...OR);
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("LISTE DES MEMBRES INSCRITS SUR LA PÉRIODE", 14, y);
    y += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, "normal");
    for (const m of listeInscrits) {
      y = nouvelleSiNecessaire(doc, y, logoData, "Rapport statistique");
      const ligne = `${m.nomComplet} — ${m.role}` +
        (m.telephone ? ` — ${m.telephone}` : "");
      doc.text(ligne, 14, y);
      y += 6;
    }
  }

  dessinerPiedDePage(doc);
  const dateFichier = new Date().toISOString().slice(0, 10);
  doc.save(`rapport-stats-${dateFichier}.pdf`);
}
