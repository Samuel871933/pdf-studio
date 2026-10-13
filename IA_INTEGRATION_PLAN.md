# Plan d’intégration d’un agent IA dans PDF Studio

## Objectif et décisions retenues

Intégrer un chatbot capable de créer et modifier le contenu, les sections et la mise en page des documents, ainsi que de créer des modèles réutilisables selon les demandes de l’utilisateur.

- Le chatbot et l’éditeur restent **dans PDF Studio** : l’utilisateur écrit ou dicte, voit le résultat, retouche à la main et continue la conversation dans la même application.
- Conserver l’hébergement statique sur GitHub Pages, **sans backend, proxy ni service intermédiaire**.
- Ne financer aucun appel IA pour les utilisateurs : chacun fournit sa propre clé API Claude ou OpenAI et paie ses appels auprès du fournisseur.
- Prévoir plusieurs fournisseurs avec des adaptateurs interchangeables et un moteur d’agent commun. « ChatGPT » désigne ici les modèles OpenAI accessibles par API, pas une session du site ChatGPT ou un abonnement utilisable comme clé API.
- Ne demander aucune installation ni téléchargement de modèle.
- **Ne jamais sauvegarder la clé API en clair.** Par défaut, elle reste uniquement en mémoire. Sur consentement explicite, un coffre local chiffré permet de la retrouver après déverrouillage par mot de passe. Rechargement, navigation et fermeture verrouillent la session.
- La clé n’appartient jamais au contexte envoyé au modèle : elle sert uniquement à l’authentification HTTP auprès du fournisseur choisi.
- Permettre la modification complète du document via des commandes contrôlées et réversibles.
- La conversation et les propositions restent en mémoire. Une option décochée par défaut, « Mémoriser cette connexion sur cet appareil », conserve ensemble fournisseur/modèle et clé chiffrée par fournisseur. Aucun mot de passe, clé en clair, journal réseau ou conversation n’est persisté. Ces données restent distinctes des projets et du brouillon local.
- L’édition classique reste locale ; envoyer une demande IA transmet son contexte utile au fournisseur. La dictée peut également utiliser le service distant du navigateur. Ne plus présenter tout le site comme « rien n’est envoyé » lorsque ces fonctions sont disponibles.

L’objectif produit est de créer un premier CV personnalisé rapidement (cible : deux minutes après configuration du compte API), puis de modifier contenu et design en boucle. Ce délai est un objectif à mesurer, pas une garantie indépendante du réseau ou du fournisseur.

## État du développement — 13 octobre 2026

Une première tranche est implémentée :

- Onglet Assistant dans l’éditeur, saisie texte, choix du fournisseur, identifiant de modèle libre prérempli (OpenAI : `gpt-4.1-mini`, Claude : `claude-sonnet-5-5`) et clé masquée. Les clés dont le préfixe identifie clairement un autre fournisseur sont refusées avant toute requête ; le champ de clé est vidé lors d’un changement de fournisseur.
- Adaptateurs HTTP directs OpenAI (Chat Completions avec outils, `store: false`) et Claude (Messages avec outils et en-tête autorisant explicitement l’accès navigateur). Aucun SDK supplémentaire ni URL API libre.
- Session privée en mémoire, déconnexion/rechargement/restauration de page, annulation et délai de deux minutes. Aucun appel de connexion génératif automatique.
- Outil commun `propose_document` : modifications partielles des champs, sections personnalisées, titres et masquage, choix parmi les modèles et palettes existants. Les listes fournies remplacent leurs collections ; aucun chemin de propriété arbitraire n’est accepté.
- Validation locale stricte, bornes de taille, conservation de la photo localement et exclusion des exemples fictifs du contexte initial lorsque la fiche n’a pas été renseignée.
- Boucle de composition et de correction bornée : jusqu’à quatre réponses API, dont au plus trois propositions ; pas de reprise automatique après erreur réseau ambiguë.
- Aperçu visuel local, détail du contenu proposé, contrôle de révision au retour et à l’application, application explicite et transaction Annuler/Rétablir avec restauration en cas d’échec.
- Les débordements bloquent l’application. Si l’utilisateur a retouché le modèle, le remplacement de ces retouches doit être explicitement accepté ; les éléments ajoutés hors modèle sont conservés.
- Dictée facultative via la reconnaissance native du navigateur, avec indication du traitement potentiellement distant ; relecture et envoi manuel du texte.
- Présentation de type chatbot : conversation défilante, bulles de messages, suggestions de démarrage, saisie ancrée en bas et indicateur de traitement. Réglages de connexion repliables, automatiquement repliés après connexion ; les aperçus sont des cartes compactes avec agrandissement et actions Appliquer/Rejeter. Entrée envoie, Maj + Entrée crée une nouvelle ligne. Le panneau de chat est adapté aux petits écrans.

**Restent à développer** : paramètres de design persistants, commandes de placement/style des éléments, identifiants stables pour les entrées standard, création et export de modèles déclaratifs, pagination, découverte des modèles API disponibles et autres fournisseurs.

Les tests utilisent des réponses API simulées : la compatibilité réelle CORS/authentification/outils depuis GitHub Pages doit encore être vérifiée avec des clés personnelles. Aucun appel facturé n’est nécessaire pour les tests locaux. Le développement ne prétend pas encore couvrir toutes les capacités du plan ci-dessous.

## Base existante et évolutions nécessaires

| Élément actuel | Utilité pour l’intégration | Évolution nécessaire |
|---|---|---|
| `src/templates/content.ts` : `Persona` | Contenu structuré, titres personnalisés, masquage et sections personnalisées avec identifiants | Ajouter des identifiants stables aux entrées standard et préserver les faits utilisateur |
| `src/templates/index.ts` : `TemplateDef` | Catalogue de modèles | Ajouter des modèles déclaratifs créés par l’utilisateur |
| `src/templates/templates.ts` | Mise en page des modèles par fonctions TypeScript | Extraire progressivement les paramètres et structures éditables |
| `src/templates/kit.ts` : `Builder` | Construction des éléments et mesures de texte | Servir de base à un moteur de composition déclaratif |
| `src/quickfill.ts` | Liaison fiche/document et régénération | Conserver les modifications de design lors des mises à jour du contenu |
| `src/editor.ts` | Fabric, manipulation et historique | Exécuter une transaction IA comme une étape Annuler/Rétablir |
| `src/project.ts` | Import/export JSON et assainissement | Versionner le nouveau format et valider les données IA |
| `src/analysis.ts` et `src/reading.ts` | Analyse locale et ordre de lecture | Vérifier le résultat après composition |

Les projets sont déjà sérialisés en JSON, mais les modèles sont des fonctions TypeScript. Le JSON actuel ne décrit donc pas une recette de mise en page entièrement personnalisable.

Le remplissage rapide conserve les éléments ajoutés hors modèle, mais une régénération remplace les retouches manuelles sur les éléments du modèle. Les modifications IA de mise en page devront devenir des données persistantes du document pour survivre à une modification du contenu.

## Expérience utilisateur

Un panneau « Assistant IA » contient :

1. Le choix du fournisseur et du modèle (identifiant saisi en première version ; découverte des modèles disponibles ensuite).
2. Un champ de clé API masqué ; option unique de mémorisation de la connexion (fournisseur, modèle, clé chiffrée), décochée par défaut.
3. Une indication : « Sans coffre, clé uniquement en mémoire. Les données nécessaires à votre demande sont envoyées au fournisseur choisi. Les appels utilisent votre compte API. »
4. Un bouton de connexion et un bouton de déconnexion qui supprime la référence à la clé et annule les requêtes actives.
5. La conversation, l’état de traitement, un bouton Stop et un résumé des changements.
6. Un aperçu local avec Appliquer/Rejeter, détails des champs proposés et avertissements de débordement.
7. Une dictée facultative : enregistrer une demande, relire le texte, puis l’envoyer. Le clavier reste disponible.

Éviter tout test de connexion génératif silencieux susceptible de déclencher des frais. Préférer une vérification non générative si le fournisseur le permet, ou utiliser la première demande explicite de l’utilisateur.

Exemples de demandes visées à terme (les actions de design libre et d’enregistrement de modèles ne sont pas encore disponibles) :

- « Voici mon parcours, crée un CV sobre avec une colonne. »
- « Ajoute une section Projets personnels avant la formation. »
- « Refais entièrement le design avec une colonne latérale verte et une photo ronde. »
- « Garde les couleurs, enlève la colonne et transforme les projets en cartes. »
- « Adapte le CV et la lettre à cette offre en conservant uniquement mes expériences réelles. »
- « Enregistre cette composition comme modèle réutilisable dans mon projet. »

La première version présente systématiquement une proposition avant application. Une application directe pourra devenir une préférence explicite après validation du moteur de transactions. L’agent demande une précision lorsqu’une information essentielle manque et ne fabrique pas de diplômes, d’employeurs ou de résultats chiffrés.

## Intégrations de fournisseurs

La conversation et les commandes ont un format interne commun, indépendant des formats OpenAI/Claude. Chaque adaptateur possède des domaines fixes, ses en-têtes d’authentification, son encodage des outils et sa normalisation des réponses, erreurs et tokens. Aucun adaptateur ne reçoit de fonction pour modifier directement le document.

Ajouter un fournisseur consiste à vérifier sa documentation officielle, les requêtes navigateur avec la CSP active, l’accès aux outils du modèle et les erreurs, puis à implémenter l’adaptateur et des tests de contrat. Une API dite « compatible OpenAI » ne suffit pas à garantir la compatibilité réelle. Un fournisseur qui interdit les appels navigateur n’est pas proposé ; aucun proxy ne contourne cette limite.

Les abonnements aux interfaces de chat ne remplacent pas les comptes API. La conservation des données côté fournisseur dépend de son contrat et de ses réglages : stockage uniquement local dans PDF Studio ne signifie pas absence de traitement ou de conservation chez le fournisseur.

## Voix

La voix est une entrée du même agent, pas un moteur séparé. La première version détecte `SpeechRecognition`/`webkitSpeechRecognition`, propose une dictée française et conserve le texte dans le champ de demande jusqu’à l’envoi. Elle affiche que le navigateur peut transmettre l’audio à son service distant. Refus du microphone ou absence de support : saisie texte disponible.

Une éventuelle transcription par API sera un adaptateur distinct utilisant la clé de l’utilisateur et un endpoint navigateur vérifié, sans backend. La conversation vocale continue et la synthèse de réponse sont des évolutions séparées, pas des prérequis du configurateur.

## Architecture de l’agent

```text
Panneau de chat
    ↓
Session IA en mémoire : fournisseur, clé, conversation, annulation
    ↓
Adaptateur Claude ou OpenAI → API du fournisseur
    ↓
Commandes structurées demandées par le modèle
    ↓
Validation des arguments et des références
    ↓
Transaction sur une copie du document
    ↓
Composition locale + vérifications
    ↓
Aperçu ou application + historique + résultats retournés au modèle
```

Le modèle ne pilote pas arbitrairement le DOM et n’exécute pas de JavaScript. Il utilise des outils définis par l’application. Les instructions système expliquent ces outils et les objectifs ; le cloisonnement effectif est assuré par le validateur et l’exécuteur.

La boucle d’agent est exécutée dans le front : envoyer la demande, recevoir les appels d’outils, exécuter les commandes autorisées, retourner les résultats au modèle, puis continuer jusqu’à une réponse finale ou une limite. Les formats de messages et d’appels d’outils diffèrent entre fournisseurs ; les adaptateurs les convertissent vers une représentation interne commune.

## Clé API : cycle de vie et limites

- Stocker la clé dans un module de session privé, hors de l’état sérialisable du document.
- Après saisie, vider le champ et retirer les références inutiles.
- Ne jamais utiliser de stockage persistant pour la clé en clair ni pour le mot de passe du coffre. Seul le coffre chiffré peut être placé dans `localStorage`, sur consentement explicite. Aucun secret ou coffre ne fait partie des fichiers de projet, de l’historique ou des exports.
- Ne jamais inclure la clé dans un prompt, un résultat d’outil, une capture, un message d’erreur ou un log.
- Envoyer la clé seulement dans les en-têtes d’authentification vers un domaine de fournisseur explicitement autorisé.
- Ne pas accepter une URL API arbitraire en première version, afin d’éviter d’envoyer une clé au mauvais destinataire.
- À la déconnexion, annuler les appels et supprimer la référence à la clé.
- La conservation en mémoire réduit la persistance, mais ne protège pas contre un script malveillant exécuté sur la page. JavaScript ne permet pas de garantir l’effacement physique d’une chaîne en mémoire.
- Une page suspendue ou restaurée par le navigateur peut conserver son état : traiter `pagehide` pour déconnecter et vérifier la déconnexion lors d’une restauration. Ne pas promettre un effacement physique instantané.

Les SDK Claude et OpenAI proposent un mode navigateur explicite, généralement nommé `dangerouslyAllowBrowser`. Il faut vérifier les appels réels depuis le site de production, notamment les prérequêtes CORS, l’authentification, les endpoints retenus et le streaming. Une option SDK ne contourne pas une interdiction CORS.

Si un endpoint ne permet pas les appels directs, le signaler sans utiliser de proxy public. Ne pas ajouter un backend ou un intermédiaire qui reçoit les clés sans décision explicite sur l’architecture.

## Coffre local facultatif — implémenté

Cette évolution remplace la décision initiale d’absence totale de persistance de connexion, à la demande explicite de l’utilisateur.

- « Mémoriser cette connexion sur cet appareil » : une seule case pour fournisseur, modèle et clé chiffrée. Mot de passe confirmé, minimum 12 caractères, puis clic Connecter pour enregistrer. Décocher efface la connexion enregistrée du fournisseur choisi, y compris ses préférences si elles étaient actives. Un coffre existant du même fournisseur est remplacé ; les coffres des autres fournisseurs sont conservés.
- Web Crypto natif : AES-GCM 256 bits ; clé dérivée du mot de passe par PBKDF2-HMAC-SHA-256, 600 000 itérations. Sel aléatoire de 16 octets et IV aléatoire de 12 octets à chaque enregistrement. Version, fournisseur et modèle sont authentifiés avec le ciphertext.
- `localStorage` conserve seulement les métadonnées et le ciphertext, jamais le mot de passe ou la clé déchiffrée. Les identifiants de modèle ressemblant à une clé API sont refusés. Formats, tailles et paramètres cryptographiques sont validés avant déchiffrement.
- Aucun déverrouillage ni appel réseau automatique. À la réouverture : choisir le fournisseur si nécessaire, saisir le mot de passe, cliquer Déverrouiller. La clé déchiffrée passe directement dans la session, pas dans le champ de clé.
- Déconnecter/recharger/restaurer une page retire les secrets de la session et des champs, mais conserve le coffre. Oublier ma clé supprime le coffre et les préférences actives du fournisseur choisi, puis déconnecte la session.
- HTTPS ou localhost et Web Crypto sont nécessaires. Stockage refusé, quota, coffre altéré, mauvais mot de passe : message explicite, sans réécriture silencieuse ni clé de secours en clair.
- Les opérations cryptographiques en attente vérifient la génération de session avant de sauvegarder ou connecter : une fermeture ou déconnexion empêche une réactivation tardive.
- Le chiffrement protège le coffre verrouillé contre sa lecture directe, pas un script malveillant pendant l’utilisation. Un mot de passe faible peut être attaqué hors ligne. Pas de récupération du mot de passe ; JavaScript ne garantit pas l’effacement physique des chaînes.

Le fournisseur est choisi par deux boutons avec logos locaux OpenAI/Claude, indication de sélection et navigation clavier. Les anciens coffres restent compatibles ; les anciennes préférences seules préremplissent la première ouverture puis sont retirées.

Implémentation : `src/ai/storage.ts`. Tests cryptographiques et parcours navigateur avec clés fictives. Aucune persistance de conversation ni de logs réseau n’est ajoutée.

## Format de document et modèles personnalisables

Introduire une représentation métier indépendante de Fabric :

- **Contenu** : identité, expériences, formations et sections personnalisées.
- **Structure** : pages, régions, colonnes, sections et ordre de lecture.
- **Styles** : palette, polices autorisées, tailles, espacements, styles de titres et décorations.
- **Éléments libres** : textes, formes, images et icônes avec position, taille et identifiant stable.
- **Liaisons** : relation entre un élément affiché et le contenu qu’il représente.

Le canevas Fabric devient une représentation calculée de ces données pour les éléments liés. Les retouches manuelles doivent mettre à jour les paramètres de composition ou des surcharges stables. Prévoir explicitement une option de placement libre/détaché pour les éléments qui ne suivent plus le flux.

Un modèle réutilisable contient la structure, les styles et les liaisons, sans intégrer par défaut le parcours personnel, les coordonnées ou la photo de son créateur. Distinguer l’export d’un projet rempli de l’export d’un modèle.

Les sections personnalisées prennent en charge au minimum : titre, paragraphes, puces et liste d’entrées. Utiliser des identifiants stables plutôt que des indices de tableau pour les commandes IA : un réordonnancement ne doit pas changer la cible d’une modification.

Ne pas annoncer la génération automatique multipage avant son implémentation. La première version peut rester sur une page avec détection de débordement ; la pagination constitue une évolution du moteur distincte.

## Outils accessibles au modèle

| Famille | Outils envisagés |
|---|---|
| Lecture | Lire le document, les sections, la sélection, les styles et les diagnostics |
| Contenu | Modifier un champ, ajouter/modifier/supprimer une entrée |
| Sections | Ajouter, renommer, réordonner, masquer ou supprimer une section |
| Composition | Définir les colonnes, affecter une section à une région, modifier les espacements |
| Styles | Modifier palette, typographie, titres et décorations |
| Éléments libres | Ajouter, déplacer, redimensionner, modifier ou supprimer un élément |
| Modèles | Créer un modèle déclaratif, modifier sa définition, appliquer un modèle |
| Vérification | Composer un aperçu et obtenir les débordements et problèmes détectés |

Chaque outil a un schéma strict, des limites de taille et une liste de valeurs autorisées. Valider aussi les règles métier : identifiant existant, police disponible, coordonnées finies, taille acceptable, références cohérentes. Les fonctions d’assainissement existantes sont utiles, mais ne suffisent pas à valider toutes les nouvelles opérations.

Ne pas exposer d’outil d’exécution de code, d’accès réseau général ou de modification des paramètres de clé. Les images personnelles passent par l’import assaini existant ; l’agent utilise leurs identifiants sans recevoir leur contenu si cela n’est pas nécessaire. La génération d’images n’est pas incluse dans cette première intégration.

## Transactions, rendu et vérification

1. Capturer une révision du document avant l’appel.
2. Valider les commandes reçues avant de modifier le document réel.
3. Les exécuter sur une copie et composer le résultat localement.
4. Vérifier débordements, placements hors page, tailles de texte et ordre de lecture. Les chevauchements intentionnels des décorations ne sont pas traités comme des erreurs de texte.
5. Retourner des diagnostics ciblés au modèle si une correction est nécessaire, dans une boucle bornée.
6. Appliquer l’ensemble comme une transaction réversible ou présenter un aperçu.

Si l’utilisateur modifie le document pendant l’appel, ne pas appliquer silencieusement des changements fondés sur une ancienne révision : revalider les cibles et recalculer, ou présenter une proposition à réexaminer.

Vérifier que la transaction capture l’état antérieur avant toute mutation. Le simple appel à une régénération ne garantit pas à lui seul une étape d’historique correcte.

## Coûts et maîtrise des appels

- Afficher clairement que la facturation relève du compte API de l’utilisateur. Un abonnement à une interface de chat n’équivaut pas automatiquement à un accès API financé.
- Définir une limite de tours, de commandes par tour et de tokens de sortie.
- Prévoir des délais d’attente, une annulation et des tentatives de reprise bornées.
- Éviter les répétitions automatiques de requêtes génératives après une erreur ambiguë : un appel peut déjà avoir été traité et facturé.
- Envoyer uniquement le contexte utile : une reformulation ciblée n’exige pas tout le canevas ni les images encodées en base64.
- Afficher l’usage de tokens retourné par le fournisseur lorsqu’il est disponible. Une estimation monétaire exige des tarifs actualisés ; ne pas afficher un montant présenté comme exact à partir d’informations obsolètes.
- Les limites du front ne garantissent pas un plafond de dépenses sur le compte fournisseur. Stop peut interrompre la réception sans annuler toute facturation déjà engagée.

## Confidentialité et configuration du site

Le mode classique reste local. Le mode IA transmet au fournisseur choisi la demande, les parties nécessaires du document et les résultats d’outils utiles. Indiquer cette différence dans l’interface et le README.

Dans `vite.config.ts`, adapter `connect-src` pour autoriser uniquement les endpoints des fournisseurs pris en charge. Conserver les autres protections existantes et éviter les scripts tiers, statistiques et ressources distantes inutiles.

La clé ne doit pas apparaître dans les exports JSON/PDF, les métadonnées, les instantanés d’historique ou les données transmises au modèle. La conversation reste en mémoire et n’est pas exportée par défaut.

## Découpage proposé

Chemins indicatifs à ajuster pendant l’implémentation :

```text
src/ai/session.ts             Clé en mémoire, fournisseur, annulation
src/ai/storage.ts             Préférences sur consentement et coffre chiffré facultatif
src/ai/providers.ts           Contrat commun et adaptateurs OpenAI/Claude (à séparer si nécessaire)
src/ai/agent.ts               Boucle d’outils et limites
src/ai/schema.ts              Schémas d’outils et validation structurelle
src/ui/ai-chat.ts             Panneau de conversation
src/editor.ts                Transactions et historique
src/quickfill.ts             Application d’une composition préparée
src/document/                À créer : document métier et modèles déclaratifs
tests/ai.test.mjs             Tests de validation, contrats API et boucle d’agent simulée
scripts/test-ai-browser.mjs   Parcours Chromium avec API interceptées et CSP de production
```

## Ordre de réalisation

### 1. Vérifier la connexion directe

Tester les deux fournisseurs depuis l’origine GitHub Pages avec une clé saisie en mémoire : requête simple explicite, appels d’outils, streaming si retenu, annulation et erreurs. Ne jamais publier de clé de test.

Les adaptateurs et tests simulés sont désormais en place. Le streaming est différé ; le modèle doit prendre en charge les outils sur l’endpoint retenu.

### 2. Construire la couche commune de commandes

Ajouter des identifiants stables, la validation, les transactions et le contrôle de révision. Commencer par les champs existants, les changements de modèle/palette et les éléments libres. Brancher ces commandes à l’éditeur pour permettre aussi leur usage hors IA.

### 3. Livrer l’assistant sur les modèles existants

Première tranche implémentée : chat, propositions de contenu/sections, choix de modèle/palette, aperçu, transactions et dictée native. Valider la production avant de présenter les intégrations comme pleinement vérifiées. Les propositions basées sur les collections complètes et une révision stricte évitent en première version d’agir sur des indices devenus obsolètes.

### 4. Rendre le design et les modèles déclaratifs

Introduire les sections personnalisées et le moteur de composition. Migrer un modèle simple, vérifier l’édition manuelle puis les changements de contenu, et étendre aux autres modèles. Versionner les projets, conserver la lecture des fichiers existants et définir l’export de modèles sans données personnelles.

### 5. Étendre l’agent au design complet

Ajouter le panneau de chat, les instructions, les outils et la boucle de correction du rendu. Permettre création, restructuration et modification complète à travers les primitives disponibles.

### 6. Vérifier l’ensemble et documenter

Vérifier les cas métier et la production avec CSP active. Mettre à jour les explications sur la confidentialité et l’usage des clés personnelles.

## Critères d’acceptation

- Un utilisateur peut connecter son compte API sans installer de logiciel ni télécharger de modèle.
- Aucune clé en clair n’est persistée ; aucun secret ou coffre n’est inclus dans les documents, prompts, logs ou exports. Le coffre chiffré n’existe qu’après un enregistrement explicite.
- Recharger la page ou se déconnecter impose une nouvelle saisie ou un déverrouillage du coffre ; une restauration de page ne réactive jamais une ancienne connexion.
- Le chat peut modifier une section précise, en ajouter une personnalisée et refaire la composition avec les primitives disponibles.
- Le modèle peut être enregistré puis réutilisé avec un autre contenu.
- Une modification du contenu conserve les styles et structures personnalisés.
- Une modification IA s’annule et se rétablit comme une opération cohérente.
- Les commandes invalides, les références inexistantes et les modifications sur une révision obsolète sont traitées explicitement.
- Les débordements sont corrigés dans une boucle bornée ou signalés ; aucune information n’est supprimée silencieusement pour faire tenir le document.
- L’export PDF conserve le texte sélectionnable, l’ordre de lecture et les métadonnées attendues.
- L’édition sans IA reste utilisable sans clé ni connexion aux fournisseurs.

## Sources à consulter lors de l’implémentation

- [SDK TypeScript Claude : utilisation navigateur et risques](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript)
- [SDK TypeScript/JavaScript OpenAI](https://developers.openai.com/api/reference/typescript)
- [Authentification et confidentialité des clés OpenAI](https://developers.openai.com/api/reference/overview)
- [JSON Schema : validation des propriétés d’objet](https://json-schema.org/understanding-json-schema/reference/object)

Les possibilités d’API, les modèles et les règles CORS devront être revérifiés au moment de l’implémentation. La clé utilisée reste en mémoire ; son éventuelle copie chiffrée est facultative. Cela ne supprime pas les risques d’un usage de clés secrètes dans un navigateur.
