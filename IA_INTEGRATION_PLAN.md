# Plan d’intégration d’un agent IA dans PDF Studio

## Objectif et décisions retenues

Intégrer un chatbot capable de créer et modifier le contenu, les sections et la mise en page des documents, ainsi que de créer des modèles réutilisables selon les demandes de l’utilisateur.

- Conserver l’hébergement statique sur GitHub Pages, sans backend obligatoire.
- Ne financer aucun appel IA pour les utilisateurs : chacun fournit sa propre clé API Claude ou OpenAI et paie ses appels auprès du fournisseur.
- Ne demander aucune installation ni téléchargement de modèle.
- **Ne jamais sauvegarder la clé API.** La conserver uniquement dans une variable en mémoire pendant la vie de la page. Un rechargement, une navigation ou une fermeture impose de la saisir à nouveau.
- La clé n’appartient jamais au contexte envoyé au modèle : elle sert uniquement à l’authentification HTTP auprès du fournisseur choisi.
- Permettre la modification complète du document via des commandes contrôlées et réversibles.

Ce document décrit une architecture à implémenter ; il ne signifie pas que ces fonctionnalités existent déjà.

## Base existante et évolutions nécessaires

| Élément actuel | Utilité pour l’intégration | Évolution nécessaire |
|---|---|---|
| `src/templates/content.ts` : `Persona` | Contenu structuré des CV et lettres | Permettre des sections personnalisées et des identifiants stables |
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

1. Le choix du fournisseur et du modèle disponible.
2. Un champ de clé API masqué, sans option de mémorisation.
3. Une indication : « Clé conservée uniquement pendant cette ouverture de la page. Les données nécessaires à votre demande sont envoyées au fournisseur choisi. Les appels utilisent votre compte API. »
4. Un bouton de connexion et un bouton de déconnexion qui supprime la référence à la clé et annule les requêtes actives.
5. La conversation, l’état de traitement, un bouton Stop et un résumé des changements.

Éviter tout test de connexion génératif silencieux susceptible de déclencher des frais. Préférer une vérification non générative si le fournisseur le permet, ou utiliser la première demande explicite de l’utilisateur.

Exemples de demandes prises en charge :

- « Voici mon parcours, crée un CV sobre avec une colonne. »
- « Ajoute une section Projets personnels avant la formation. »
- « Refais entièrement le design avec une colonne latérale verte et une photo ronde. »
- « Garde les couleurs, enlève la colonne et transforme les projets en cartes. »
- « Adapte le CV et la lettre à cette offre en conservant uniquement mes expériences réelles. »
- « Enregistre cette composition comme modèle réutilisable dans mon projet. »

Une demande explicite de modification peut autoriser son application directe, avec résumé et annulation. Une demande exploratoire ou plusieurs variantes produisent un aperçu avant application. L’agent demande une précision lorsqu’une information essentielle manque et ne fabrique pas de diplômes, d’employeurs ou de résultats chiffrés.

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
- Ne jamais utiliser `localStorage`, `sessionStorage`, IndexedDB, cookie, URL, fichier de projet ou historique pour la clé.
- Ne jamais inclure la clé dans un prompt, un résultat d’outil, une capture, un message d’erreur ou un log.
- Envoyer la clé seulement dans les en-têtes d’authentification vers un domaine de fournisseur explicitement autorisé.
- Ne pas accepter une URL API arbitraire en première version, afin d’éviter d’envoyer une clé au mauvais destinataire.
- À la déconnexion, annuler les appels et supprimer la référence à la clé.
- La conservation en mémoire réduit la persistance, mais ne protège pas contre un script malveillant exécuté sur la page. JavaScript ne permet pas de garantir l’effacement physique d’une chaîne en mémoire.
- Une page suspendue ou restaurée par le navigateur peut conserver son état : traiter `pagehide` pour déconnecter et vérifier la déconnexion lors d’une restauration. Ne pas promettre un effacement physique instantané.

Les SDK Claude et OpenAI proposent un mode navigateur explicite, généralement nommé `dangerouslyAllowBrowser`. Il faut vérifier les appels réels depuis le site de production, notamment les prérequêtes CORS, l’authentification, les endpoints retenus et le streaming. Une option SDK ne contourne pas une interdiction CORS.

Si un endpoint ne permet pas les appels directs, le signaler sans utiliser de proxy public. Ne pas ajouter un backend ou un intermédiaire qui reçoit les clés sans décision explicite sur l’architecture.

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
src/ai/providers/openai.ts    Adaptateur API OpenAI
src/ai/providers/claude.ts    Adaptateur API Claude
src/ai/agent.ts               Boucle d’outils et limites
src/ai/context.ts             Contexte minimal, sans secrets
src/ai/tools.ts               Définitions des outils
src/ai/validation.ts          Validation structurelle et métier
src/ai/transactions.ts        Aperçu, révisions et application réversible
src/ui/ai-chat.ts             Panneau de conversation
src/document/                Document métier et modèles déclaratifs
```

## Ordre de réalisation

### 1. Vérifier la connexion directe

Tester les deux fournisseurs depuis l’origine GitHub Pages avec une clé saisie en mémoire : requête simple explicite, appels d’outils, streaming si retenu, annulation et erreurs. Ne jamais publier de clé de test.

### 2. Construire la couche commune de commandes

Ajouter des identifiants stables, la validation, les transactions et le contrôle de révision. Commencer par les champs existants, les changements de modèle/palette et les éléments libres. Brancher ces commandes à l’éditeur pour permettre aussi leur usage hors IA.

### 3. Rendre les sections et modèles déclaratifs

Introduire les sections personnalisées et le moteur de composition. Migrer un modèle simple, vérifier l’édition manuelle puis les changements de contenu, et étendre aux autres modèles. Versionner les projets, conserver la lecture des fichiers existants et définir l’export de modèles sans données personnelles.

### 4. Intégrer l’agent complet

Ajouter le panneau de chat, les instructions, les outils et la boucle de correction du rendu. Permettre création, restructuration et modification complète à travers les primitives disponibles.

### 5. Vérifier l’ensemble et documenter

Vérifier les cas métier et la production avec CSP active. Mettre à jour les explications sur la confidentialité et l’usage des clés personnelles.

## Critères d’acceptation

- Un utilisateur peut connecter son compte API sans installer de logiciel ni télécharger de modèle.
- Aucune clé n’est persistée ou incluse dans les documents, prompts, logs ou exports.
- Recharger la page ou se déconnecter impose une nouvelle saisie ; une restauration de page ne réactive pas une ancienne connexion.
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

Les possibilités d’API, les modèles et les règles CORS devront être revérifiés au moment de l’implémentation. Le stockage uniquement en mémoire est une décision de conception ; il ne supprime pas les risques d’un usage de clés secrètes dans un navigateur.
