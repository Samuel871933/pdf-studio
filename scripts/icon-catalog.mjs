// Sélection d'icônes Material Design (Apache 2.0) classées par thème, avec mots-clés français.
// Format : « nom-mdi | mots clés ». Les noms absents de @mdi/js sont signalés puis ignorés.
export const CATALOG = [
  {
    id: 'contact',
    label: 'Contact',
    icons: `
      phone|téléphone tel appel
      phone-outline|téléphone tel appel
      cellphone|portable mobile smartphone
      email|mail courriel e-mail
      email-outline|mail courriel e-mail
      at|arobase mail
      map-marker|adresse lieu localisation ville
      map-marker-outline|adresse lieu localisation ville
      home|maison domicile adresse
      home-outline|maison domicile adresse
      web|site internet web
      earth|monde international site
      link-variant|lien url
      card-account-details|identité carte
      card-account-details-outline|identité carte
      account|profil personne
      account-outline|profil personne
      account-circle|profil avatar
      calendar|date naissance agenda
      calendar-month|date agenda
      cake-variant|anniversaire naissance âge
      car|permis voiture véhicule
      card-account-mail|contact carte
      message-text|message sms
      chat|discussion message
      qrcode|qr code
      send|envoyer
      clock-outline|horaire disponibilité heure
    `,
  },
  {
    id: 'reseaux',
    label: 'Réseaux',
    icons: `
      linkedin|linkedin réseau professionnel
      github|github code dépôt
      gitlab|gitlab code dépôt
      twitter|twitter x réseau
      instagram|instagram photo réseau
      facebook|facebook réseau
      youtube|youtube vidéo
      twitch|twitch streaming
      reddit|reddit
      pinterest|pinterest
      spotify|spotify musique
      whatsapp|whatsapp message
      skype|skype appel
      slack|slack
      stack-overflow|stack overflow développeur
      dev-to|dev.to blog
      mastodon|mastodon
      npm|npm paquet
      wordpress|wordpress blog site
      google|google
      microsoft|microsoft
      apple|apple
      android|android
      rss|rss blog flux
      share-variant|partager
    `,
  },
  {
    id: 'parcours',
    label: 'Parcours',
    icons: `
      briefcase|expérience emploi travail poste
      briefcase-outline|expérience emploi travail poste
      briefcase-variant|expérience emploi mission
      office-building|entreprise société bureau
      office-building-outline|entreprise société bureau
      domain|entreprise organisation
      factory|industrie usine
      store|commerce magasin boutique
      school|formation diplôme école études
      school-outline|formation diplôme école études
      book-education|formation études
      certificate|certificat diplôme certification
      certificate-outline|certificat diplôme
      seal|label certification
      trophy|prix récompense réussite
      trophy-outline|prix récompense
      medal|médaille distinction
      ribbon|distinction
      star|étoile favori note
      star-outline|étoile favori
      star-half-full|niveau note
      flag|objectif drapeau
      flag-checkered|objectif fin
      target|objectif cible
      bullseye-arrow|objectif cible résultat
      chart-line|croissance résultat performance
      chart-bar|statistiques résultats
      chart-pie|statistiques répartition
      trending-up|progression hausse croissance
      timeline|parcours chronologie
      timeline-text|parcours chronologie
      timer-sand|durée temps
      handshake|partenariat négociation commercial
      handshake-outline|partenariat négociation
      account-group|équipe management collaboration
      account-tie|manager direction cadre
      account-supervisor|management encadrement
      account-multiple|équipe
      account-voice|communication prise de parole
      account-heart|bénévolat social
      hand-heart|bénévolat associatif solidarité
      lightbulb|idée créativité innovation
      lightbulb-outline|idée créativité
      rocket-launch|lancement projet startup
      rocket|projet startup
      puzzle|résolution problème
      cog|technique paramètre
      cogs|technique processus
      tools|outils
      wrench|maintenance réparation outil
      hammer-wrench|bricolage technique
      clipboard-check|gestion projet tâche
      clipboard-text|dossier compte rendu
      file-document|document rapport
      file-document-outline|document rapport
      presentation|présentation conférence
      bullhorn|marketing communication annonce
      currency-eur|euro finance budget salaire
      cash|argent finance
      bank|banque finance
      scale-balance|droit juridique justice
      gavel|droit juridique
      stethoscope|santé médecine
      hospital-box|santé hôpital
      pill|pharmacie médicament
      truck|logistique transport livraison
      airplane|voyage aviation international
      cart|commerce achat vente
      shopping|commerce vente
      silverware-fork-knife|restauration cuisine
      chef-hat|cuisine chef
      leaf|environnement écologie nature
      recycle|environnement recyclage
      shield-check|sécurité qualité
      security|sécurité
      lock|sécurité confidentialité
      license|licence
    `,
  },
  {
    id: 'competences',
    label: 'Compétences',
    icons: `
      code-tags|code développement programmation
      code-braces|code développement
      console|terminal ligne de commande
      laptop|ordinateur informatique
      monitor|écran informatique
      monitor-dashboard|tableau de bord
      server|serveur hébergement
      database|base de données sql
      cloud|cloud nuage
      cloud-outline|cloud nuage
      api|api interface
      git|git versionning
      source-branch|branche git
      bug|bug test débogage
      language-html5|html web
      language-css3|css web style
      language-javascript|javascript js
      language-typescript|typescript ts
      language-php|php
      language-python|python
      language-java|java
      language-csharp|c# csharp
      language-cpp|c++ cpp
      language-go|go golang
      language-rust|rust
      language-ruby|ruby
      language-swift|swift ios
      language-kotlin|kotlin android
      language-r|r statistiques
      react|react
      vuejs|vue
      angular|angular
      nodejs|node
      docker|docker conteneur
      kubernetes|kubernetes
      aws|aws amazon cloud
      microsoft-azure|azure cloud
      google-cloud|gcp cloud
      linux|linux
      microsoft-windows|windows
      jira|jira gestion projet
      trello|trello gestion
      microsoft-excel|excel tableur
      microsoft-word|word traitement de texte
      microsoft-powerpoint|powerpoint présentation
      microsoft-teams|teams
      google-drive|drive
      palette|design couleur graphisme
      palette-outline|design couleur
      draw|dessin illustration
      pencil|rédaction écrire
      pencil-outline|rédaction écrire
      brush|peinture design
      vector-bezier|vectoriel graphisme
      image|image photo visuel
      camera|photo appareil
      video|vidéo montage
      movie-open|cinéma vidéo
      microphone|audio podcast voix
      headphones|audio musique
      translate|langues traduction
      earth|langues international
      chat-processing|communication
      brain|réflexion analyse intelligence
      robot|ia robot automatisation
      robot-outline|ia robot
      calculator|calcul comptabilité
      chart-timeline-variant|planification gantt
      sitemap|organisation arborescence
      layers|couches architecture
      responsive|responsive mobile
      cellphone-link|mobile multi-écran
      magnify|recherche analyse
      eye|observation
      check-decagram|validé vérifié qualité
    `,
  },
  {
    id: 'loisirs',
    label: 'Loisirs',
    icons: `
      run|course à pied running sport
      run-fast|course sprint sport
      walk|marche randonnée
      hiking|randonnée montagne
      bike|vélo cyclisme
      swim|natation piscine
      weight-lifter|musculation sport
      dumbbell|musculation fitness
      yoga|yoga méditation
      meditation|méditation zen
      soccer|football foot
      basketball|basketball
      tennis|tennis
      volleyball|volley
      rugby|rugby
      golf|golf
      ski|ski montagne
      snowboard|snowboard
      surfing|surf
      sail-boat|voile bateau
      horse|équitation cheval
      karate|karaté arts martiaux
      boxing-glove|boxe
      hand-heart-outline|entraide
      fish|pêche aquarium
      chess-knight|échecs
      gamepad-variant|jeux vidéo gaming
      controller|jeux vidéo
      cards-playing|jeux de cartes
      dice5|jeux de société
      puzzle-outline|puzzle
      music|musique
      music-note|musique note
      guitar-acoustic|guitare musique
      guitar-electric|guitare électrique
      piano|piano musique
      violin|violon
      saxophone|saxophone
      microphone-variant|chant karaoké
      book-open-page-variant|lecture livre
      book-open-variant|lecture livre
      bookshelf|lecture bibliothèque
      feather|écriture poésie
      theater|théâtre
      drama-masks|théâtre spectacle
      filmstrip|cinéma film
      camera-iris|photographie
      palette-swatch|peinture art
      flower|jardinage fleur
      sprout|jardinage plante
      tree|nature arbre
      paw|animaux
      dog|chien animaux
      cat|chat animaux
      airplane-takeoff|voyage
      bag-suitcase|voyage valise
      map|voyage carte
      compass|voyage exploration
      tent|camping
      beach|plage vacances
      silverware-variant|gastronomie
      coffee|café
      glass-wine|œnologie vin
      food-croissant|pâtisserie
      cake|pâtisserie gâteau
      needle|couture
      motorbike|moto
      car-sports|automobile
      telescope|astronomie
      star-shooting|astronomie
      heart|passion cœur
      charity|associatif bénévolat
      church|spiritualité
    `,
  },
  {
    id: 'qualites',
    label: 'Qualités',
    icons: `
      check|validé ok
      check-circle|validé ok
      check-circle-outline|validé ok
      check-bold|validé
      checkbox-marked|coché
      thumb-up|positif
      emoticon-happy|souriant bonne humeur
      heart-outline|passion
      hand-okay|ok
      fire|motivation énergie
      lightning-bolt|énergie dynamique
      run-fast|réactivité dynamique
      speedometer|performance rapidité
      account-check|fiable
      shield-account|fiable rigueur
      eye-check|rigueur attention
      clock-check|ponctualité
      calendar-check|organisation
      format-list-checks|organisation méthode
      sync|adaptabilité
      autorenew|adaptabilité
      head-lightbulb|créativité
      head-cog|analyse réflexion
      account-voice|communication
      comment-quote|citation
      format-quote-open|citation guillemets
      infinity|persévérance
      diamond-stone|excellence
      crown|leadership
      podium|compétition
      sword-cross|combativité
    `,
  },
  {
    id: 'formes',
    label: 'Formes & flèches',
    icons: `
      circle|rond cercle puce
      circle-outline|rond cercle
      circle-medium|puce point
      circle-small|puce point
      square|carré
      square-rounded|carré arrondi
      square-outline|carré
      rhombus|losange
      triangle|triangle
      hexagon|hexagone
      hexagon-outline|hexagone
      octagon|octogone
      star-four-points|étoile
      star-circle|étoile
      decagram|badge
      heart|cœur
      water|goutte
      cloud|nuage
      shape|formes
      arrow-right|flèche droite
      arrow-left|flèche gauche
      arrow-up|flèche haut
      arrow-down|flèche bas
      arrow-right-bold|flèche droite
      arrow-top-right|flèche diagonale
      arrow-right-thin|flèche fine
      chevron-right|chevron
      chevron-double-right|chevron double
      chevron-down|chevron bas
      menu-right|triangle puce
      play|lecture triangle puce
      arrow-right-circle|flèche cercle
      arrow-u-down-right|flèche retour
      swap-horizontal|échange
      plus|plus ajouter
      minus|moins
      close|croix
      equal|égal
      percent|pourcentage
      pound|dièse
      asterisk|astérisque
      dots-horizontal|points
      dots-vertical|points
      minus-thick|tiret
      ray-start-arrow|ligne flèche
      vector-line|ligne
      wave|vague
      sine-wave|onde
      signature-freehand|signature
      format-quote-close|guillemets
    `,
  },
  {
    id: 'documents',
    label: 'Bureau',
    icons: `
      file|fichier
      file-pdf-box|pdf
      file-word|word
      folder|dossier
      folder-open|dossier
      paperclip|pièce jointe
      printer|imprimer
      calendar-today|aujourd'hui date
      clock|heure
      bell|notification
      bookmark|marque-page
      tag|étiquette tag
      tag-multiple|étiquettes tags
      label|étiquette
      information|information
      information-outline|information
      help-circle|aide question
      alert|attention alerte
      alert-circle|attention
      lightbulb-on|astuce
      pin|épingle
      key|clé
      download|télécharger
      upload|téléverser
      magnify|recherche loupe
      cog-outline|paramètres
      account-box|profil
      badge-account|badge
      badge-account-horizontal|badge
      wifi|wifi
      gift|cadeau
      home-city|ville
      city|ville
      sun-compass|orientation
      weather-sunny|soleil
      moon-waning-crescent|lune
    `,
  },
];
