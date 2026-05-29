# Registre des Membres MMLC — Application Web

Application web pour gérer les membres du Ministère Maison de Lumière du Canada.
Synchronisée en temps réel avec l'application Android via la même base Firebase.

## Fonctionnalités

Mêmes fonctionnalités que l'app Android :

- Authentification (mêmes identifiants admin que sur Android)
- Liste, ajout, modification, suppression de membres
- Champs : nom, prénom, contacts, adresse, date de naissance, rôle, **statut matrimonial**, **régularité**, groupes, notes
- Pastille verte/rouge selon la régularité
- Groupes et cellules (création, modification, gestion des membres)
- Historique de présence par membre
- Statistiques avec filtres par période (semaine / mois précis / année précise / tout)
- Exports CSV : membres, présences, groupes, membres par rôle
- Génération PDF : fiche membre, fiche groupe, rapport statistique (tous avec le logo MMLC)
- Notification d'anniversaire au démarrage

## Mise en route — 3 étapes

### Étape 1 : Configurer Firebase pour le web

1. Ouvre [console.firebase.google.com](https://console.firebase.google.com)
2. Sélectionne ton projet **ministere-lumiere**
3. Engrenage → **Paramètres du projet** → onglet **Général**
4. Section "Vos applications" → clique sur l'icône web **`</>`**
5. Donne un nom à l'app (ex : "Registre MMLC Web")
6. NE coche **PAS** "Configurer Firebase Hosting" pour l'instant
7. Firebase t'affiche un bloc avec `firebaseConfig = {...}` — copie les valeurs
8. Ouvre `public/firebase-config.js` et remplace `apiKey` et `appId` par les vraies valeurs

### Étape 2 : Lancer en local pour tester

Tu as deux options pour tester en local :

**Option A — Avec Python (déjà installé sur Windows 10/11 récents)**
```bash
cd public
python -m http.server 8000
```
Puis ouvre http://localhost:8000 dans ton navigateur.

**Option B — Avec Firebase CLI (recommandé)**
```bash
npm install -g firebase-tools
firebase login
firebase serve
```
Puis ouvre http://localhost:5000.

Connecte-toi avec ton compte admin (le même que sur Android). Tu devrais voir
exactement les mêmes membres et groupes qu'en ce moment sur ton téléphone.

### Étape 3 : Déployer sur Firebase Hosting (gratuit)

Une fois que tu as testé en local et que tout fonctionne :

```bash
npm install -g firebase-tools     # si pas encore fait
firebase login                     # te connecte à ton compte Google
firebase deploy                    # publie l'app
```

À la fin, Firebase te donne une URL du type :
**https://ministere-lumiere.web.app**

Tu peux maintenant accéder à l'app depuis n'importe quel navigateur, sur PC ou
téléphone, n'importe où dans le monde, en te connectant avec ton compte admin.

## Synchronisation

Tout ce que tu fais sur le web apparaît immédiatement sur Android, et vice-versa.
Pas de bouton "rafraîchir" à appuyer : Firestore pousse les changements en temps réel.

**Note importante sur les photos** : la web app ne gère pas les photos pour rester
compatible avec le système de stockage local utilisé sur Android. Les avatars
affichent les initiales du membre. Tu peux toujours ajouter une photo depuis l'app
Android et elle sera visible localement sur ce téléphone uniquement.

## Structure des fichiers

```
RegistreMMLC-Web/
├── firebase.json              # configuration Firebase Hosting
├── .firebaserc                # référence au projet ministere-lumiere
├── README.md                  # ce fichier
└── public/                    # ← contenu déployé sur Hosting
    ├── index.html             # page unique (SPA avec sidebar)
    ├── styles.css             # styles, charte MMLC
    ├── firebase-config.js     # config à remplir
    ├── app.js                 # logique de l'app (auth, routing, CRUD, exports)
    ├── pdf.js                 # génération PDF avec jsPDF
    └── assets/
        └── logo_mmlc.png      # logo du ministère
```

## Sécurité

L'app web utilise les mêmes règles Firestore que ton app Android : seul un utilisateur
authentifié peut lire ou modifier les données. Les règles sont déjà en place dans la
console Firebase.

## Mise à jour

Pour publier une nouvelle version, il suffit de relancer `firebase deploy`.
Les utilisateurs verront automatiquement la nouvelle version au prochain
rafraîchissement de leur navigateur.
