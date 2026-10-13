# PDF Studio

Éditeur de PDF qui fonctionne entièrement dans le navigateur : formes, textes, couleurs, images, positions libres, puis export en **PDF vectoriel** (texte net et sélectionnable, polices intégrées).

**Édition locale, sans backend ni cookie.** Le document en cours peut être gardé en brouillon sur l’appareil (désactivable). L’assistant IA facultatif envoie vos demandes et leur contexte directement au fournisseur choisi, avec votre clé API personnelle.

## Fonctionnalités

- **Présentation chatbot** (onglet « Chat IA ») : messages en bulles, suggestions de démarrage, conversation défilante et saisie toujours accessible en bas. Connexion dans des réglages repliables ; aperçus compacts à agrandir, avec Appliquer/Rejeter. Entrée envoie, Maj + Entrée ajoute une ligne. Interface adaptée aux petits écrans.
- **Assistant IA intégré** (première version) : OpenAI ou Claude, avec votre compte API et l’identifiant d’un modèle prenant en charge les outils. Crée ou modifie le contenu, les sections, le modèle et la palette. Aperçu avant application, contrôle des débordements, Annuler/Rétablir. Conversation et clé utilisée uniquement en mémoire. Option unique de mémorisation de la connexion (fournisseur, modèle, clé chiffrée) : après déconnexion ou rechargement, déverrouillez le coffre ou saisissez une clé. Aucun appel automatique à la connexion. Dictée facultative selon le navigateur, texte relu avant envoi. Les retouches du modèle peuvent être remplacées après acceptation explicite ; les éléments ajoutés séparément sont conservés. La création de modèles réutilisables et le design libre par IA restent à développer. Les appels directs depuis GitHub Pages restent à vérifier avec des clés réelles ; pas de proxy de secours.
- **10 modèles** (données fictives) et **7 palettes** : Classique, Hybride, Chronologique, Junior / Alternance (une colonne, idéaux pour les ATS), Bandeau, Tech (deux colonnes), Barre latérale et Organique (graphiques), Lettre de motivation assortie et Lettre classique
- Mise en page automatique des modèles : les sections se répartissent sur la page, sans chevauchement, et le texte est écrit dans l'ordre de lecture (important pour les ATS)
- **Remplissage rapide** (onglet « Contenu ») : un formulaire pour l'identité, la photo, le profil, les expériences, formations, réalisations, compétences, outils, langues, centres d'intérêt et la lettre ; la page se compose en direct
  - on ajoute, supprime et réordonne les expériences, formations, compétences… et la mise en page suit
  - la fiche est conservée quand on change de modèle (les miniatures de la galerie la montrent) et enregistrée dans le projet
  - modifier un texte sur la page met aussi la fiche à jour ; les éléments ajoutés à la main sont conservés
  - si le contenu ne tient pas, les espacements se resserrent, puis une alerte indique la section qui dépasse
  - « Détacher » arrête le lien pour finir le design librement
  - les **propriétés du PDF** se remplissent toutes seules (titre « CV – Nom – Poste », auteur, résumé, mots-clés) ; un champ modifié à la main est conservé, « ↺ Auto » le rend de nouveau automatique
- Modèles **déjà organisés en groupes** (une section = un groupe) ; les fonds communs sont dans un groupe « Arrière-plan » verrouillé
- **Panneau Calques** (repliable) : la pile des éléments, du premier plan à l'arrière-plan
  - clic pour sélectionner (Maj / Ctrl : ajouter), glisser-déposer pour changer de plan
  - masquer (ni affiché ni exporté) et verrouiller chaque élément
  - **groupes** (Ctrl+G / Ctrl+Maj+G) : dépliables, renommables (double-clic), verrouillables et masquables d'un clic ; un clic sur la page sélectionne tout le groupe, un double-clic l'élément seul. Les groupes n'existent que dans l'éditeur : dans le PDF, les éléments restent séparés (ordre de lecture et balisage intacts)
- **Barre d'actions flottante** au-dessus de la sélection : verrouiller, grouper, dupliquer, premier plan / arrière-plan, supprimer
- **Bibliothèque d'icônes** : 389 icônes classées par thème avec recherche en français, plus les 7 400+ icônes Material Design en recherche complète, et import de vos propres icônes SVG (seule la géométrie est conservée)
- **Grille de mise en page** : 1 colonne, barre latérale gauche ou droite, colonne de dates, 2 ou 3 colonnes, grille 12 colonnes, plus des rangées optionnelles (grille de modules) ; marges et gouttières réglables
  - quand la grille est affichée, les alignements se font **dans la colonne** (et la rangée) de l'élément
  - **placer dans les colonnes** en un clic (colonne 1, 2…, toute la largeur, ou « de la colonne 3 à 6 » en grille 12)
  - **contenir dans la grille** : en déplacement comme en redimensionnement, rien ne dépasse des marges
  - accroche aux bords des colonnes et des rangées en déplacement **et** en redimensionnement
- **Colonnage** ancré sous les propriétés, toujours sous la main (repliable)
- **Barre d'actions** en bas : colonnes, grille, magnétisme, actions rapides sur la sélection, position et taille, zoom, aide des raccourcis
- Titres, textes, listes à puces ; gras, souligné et couleur sur une partie du texte
- Rectangles (coins arrondis), cercles, triangles, étoiles, bannières, lignes
- Images (PNG, JPEG, WebP, GIF) : bouton, glisser-déposer ou coller ; recadrage rond, miroir, remplacement
- **Remplir une forme avec une image** : l'image prend la forme (étoile, triangle, bannière, cercle…), à l'écran comme dans le PDF
- Déplacement, redimensionnement, rotation, magnétisme avec repères, alignement sur la page
- Plans (premier plan / arrière-plan), verrouillage (Ctrl+Maj+L), dupliquer, copier-coller
- Annuler / rétablir, raccourcis clavier
- **Navigation** : glisser dans l'espace vide (ou bouton du milieu) pour déplacer la vue ; clic maintenu + molette (ou Ctrl + molette) pour zoomer sur le curseur
- Enregistrement et ouverture du projet en `.json` (fichier local)

## Optimisé pour la lecture par les IA et les ATS

Les outils de tri automatique extraient le texte du PDF (souvent avec PyMuPDF, pypdf ou pdfplumber) puis le donnent à un modèle de langage. L'export est conçu pour ce traitement :

- **Ordre de lecture réel** : les colonnes sont détectées et le texte est écrit colonne par colonne, de haut en bas, quel que soit l'ordre de création. Un CV à deux colonnes n'est plus mélangé à l'extraction.
- **PDF balisé** : nom (H1), sections (H2), intitulés (H3), paragraphes, vraies listes à puces et photo (Figure avec texte alternatif) ; les décorations sont marquées comme artefacts et ignorées.
- **Liens cliquables** détectés automatiquement : e-mail (`mailto:`), téléphone (`tel:`), LinkedIn, GitHub, sites web.
- **Texte propre** : vraies polices Unicode (aucun texte en image), espaces restitués aux retours à la ligne, aucune ligature.
- **Métadonnées** : titre, auteur, résumé et mots-clés dans le dictionnaire du PDF et en XMP.

Le bouton **Analyse IA** (100 % local) affiche le texte exactement tel qu'une IA le lira et signale :
le texte invisible ou recouvert, les consignes destinées à une IA (assimilées à de la manipulation et détectées par les outils de tri), le contraste et la taille, les coordonnées, les sections standards, les dates, les jauges de niveau non lisibles, la longueur.
Il compare aussi le document à une **offre d'emploi** collée : pourcentage de mots-clés couverts, termes présents et absents.

## Sécurité et confidentialité

| Mesure | Détail |
|---|---|
| Transmission facultative | Pas de backend ni de statistiques ; scripts, polices et icônes intégrés au site. Le mode classique reste local. L’assistant transmet la demande, le contenu utile (sans photo) et les derniers échanges au fournisseur choisi. La dictée peut transmettre la voix au service du navigateur. |
| Content-Security-Policy | `connect-src 'self' https://api.openai.com https://api.anthropic.com`, `script-src 'self'`, `object-src 'none'`, Trusted Types… (injectée en `<meta>` au build). Aucun domaine API arbitraire. |
| Session IA | Conversation, propositions et clé déverrouillée en mémoire ; aucun ajout aux exports, projets ou brouillons. Une option sur consentement mémorise fournisseur, modèle et clé dans un coffre chiffré local (AES-GCM, PBKDF2), avec mot de passe jamais enregistré. Déconnexion/rechargement verrouillent la session ; « Oublier ma clé » efface le coffre du fournisseur choisi. La clé sert à l’authentification HTTP et n’entre pas dans les prompts. Les erreurs distantes ne sont pas affichées telles quelles. Le fournisseur applique ses propres règles de traitement et de conservation ; la facturation utilise votre compte API. |
| Stockage limité à l'appareil | Pas de cookie ni IndexedDB. Le `localStorage` garde un **brouillon automatique du document en cours** (un seul : en ouvrir ou en créer un autre le remplace) ainsi que les préférences d'interface, les réglages IA mémorisés et les coffres chiffrés facultatifs. Le badge « Local hors IA » permet de désactiver le brouillon ou de l'effacer (conseillé sur un ordinateur partagé). Brouillon désactivé ou trop volumineux : une alerte prévient avant de fermer un document modifié. |
| Images assainies | Décodées puis ré-encodées via un canvas, ce qui supprime les EXIF/GPS et tout contenu caché ; taille limitée. Les SVG ne sont jamais affichés tels quels : seule leur géométrie est extraite (icônes) |
| Projets validés | À l'ouverture, seuls les types et propriétés connus sont conservés ; les URL externes et les motifs sont rejetés |
| Métadonnées PDF | Sans modèle relié, l'auteur reste vide ; avec le remplissage rapide, il reprend le nom saisi (modifiable ou effaçable) |

## Optimisation

- Interface en TypeScript sans framework ; adaptateurs IA via `fetch`, sans SDK de fournisseur supplémentaire
- Icônes chargées à la demande : la sélection (67 Ko compressés) à l'ouverture de la bibliothèque, la bibliothèque complète seulement en cas de recherche étendue
- Générateur PDF écrit sur mesure (**6 Ko compressés**, chargé seulement au clic sur « Exporter »), avec la compression native du navigateur (`CompressionStream`)
- Polices réduites au jeu latin : environ 15 Ko en WOFF2 pour l'écran et 30 Ko en TTF pour le PDF
- Images rééchantillonnées à 300 dpi à l'export ; JPEG pour les images opaques, PNG avec masque alpha pour les transparentes
- Exemple : un CV d'une page avec photo pèse environ 85 Ko et se génère en moins de 100 ms

## Développement

```bash
npm install        # installe les dépendances (node_modules n'est jamais versionné)
npm run icons      # régénère les fichiers d'icônes (lancé automatiquement par dev et build)
npm run dev        # serveur local : http://localhost:5173
npm run build      # build de production dans dist/
npm run preview    # teste le build (avec la CSP active)
npm run test:ai    # tests simulés de l’intégration IA (Node >= 22.13, aucun appel facturé)
npm run test:ai:browser # build puis parcours Chromium avec API interceptées, sans appel facturé
```

## Déploiement sur GitHub Pages

1. Créer un dépôt GitHub et y pousser ce dossier (`node_modules/` et `dist/` sont ignorés par `.gitignore`).
2. Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Chaque push sur `main` lance [.github/workflows/deploy.yml](.github/workflows/deploy.yml) : `npm ci`, puis `npm run build`, puis publication de `dist/`.

Le site utilise des chemins relatifs (`base: './'`), il fonctionne donc à l'adresse `https://<utilisateur>.github.io/<dépôt>/` sans configuration.

## Structure

```
src/
  main.ts         Interface : barre d'outils, fichiers, raccourcis
  editor.ts       Canevas, zoom, magnétisme, historique, copier-coller
  panel.ts        Panneau de propriétés
  shapes.ts       Formes et icônes de base
  layout.ts       Colonnages (repères, magnétisme)
  quickfill.ts    Remplissage rapide : régénération de la page depuis la fiche, synchronisation des textes
  ai/             Session en mémoire, coffre chiffré facultatif, adaptateurs OpenAI/Claude, schémas et boucle d’agent
  templates/      Modèles : palettes et moteur de mise en page (kit.ts), fiche et exemples fictifs (content.ts),
                  liaison texte ↔ champ (fields.ts), modèles, conseils
  icons/          Bibliothèque d'icônes (chargement, recherche) et import SVG sécurisé
  ui/             Fenêtres et panneaux : galerie de modèles, bibliothèque d'icônes, calques, barre flottante, barre du bas, analyse IA
  reading.ts      Ordre de lecture (détection des colonnes), rôles des textes, liens
  analysis.ts     Analyse IA locale et comparaison avec une offre
  images.ts       Import d'images sécurisé
  project.ts      Enregistrement / ouverture et validation des projets
  export-pdf.ts   Conversion des objets en opérateurs PDF
  pdf/document.ts Écriture du fichier PDF (objets, polices Type0, images, compression)
  pdf/ttf.ts      Lecture des polices TrueType
  fonts/          Lato, Montserrat, Arima, Poppins, DM Serif Display (licence SIL OFL, réduites au jeu latin)
```

## Choix des modèles (recherches)

- Le premier tri d'un CV est très rapide : des titres de section clairs, une mise en page aérée et des puces courtes retiennent mieux l'attention ([étude Ladders, 2018](https://www.hrdive.com/news/eye-tracking-study-shows-recruiters-look-at-resumes-for-7-seconds/541582/)).
- Pour les portails de recrutement, une colonne reste le choix le plus sûr. Deux colonnes bien construites sont généralement lues correctement par les logiciels récents ([Enhancv](https://enhancv.com/blog/are-two-column-resumes-ats-friendly/), [banc d'essai 2026](https://atsverification.com/blog/ats-parsing-benchmark-2026/)).
- Format hybride (compétences puis parcours) pour une reconversion ([Jobscan](https://www.jobscan.co/blog/hybrid-resumes-best-resume-format/)) ; formation en premier pour un étudiant.
- En France : une page, expérience la plus récente en premier, photo facultative, ni âge ni situation familiale ([Novorésumé](https://novoresume.com/career-blog/french-resume)).

## Licences

Polices sous licence SIL Open Font License : voir [public/licenses/](public/licenses/). Icônes : Material Design Icons (Apache 2.0).
# pdf-creator

Logos OpenAI et Claude : Simple Icons 13.21.0 (CC0), intégrés localement ; voir [la licence](public/licenses/Simple-Icons-CC0.txt). Les marques restent celles de leurs propriétaires.
