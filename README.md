# Quotidien — Muscu · Dépenses · Repas

Web app (PWA) à installer sur l'iPhone depuis Safari. Aucune dépendance, aucun serveur :
les données restent sur le téléphone (stockage local du navigateur).

## Fonctions

- **Musculation** : génération de plans (objectif, nb de séances, niveau, salle/maison),
  édition des exercices, séance guidée avec minuteur de repos, historique et progression
  automatique des charges.
- **Dépenses** : dépenses et revenus par catégorie, navigation par mois, budget mensuel
  avec reste à dépenser par jour.
- **Repas & courses** : planning midi/soir de la semaine, recettes, liste de courses
  générée automatiquement à partir du menu (quantités additionnées).

⚙︎ en haut à droite : export / import d'une sauvegarde JSON.

## Tester sur le Mac

```bash
python3 -m http.server 8765
```

Puis ouvrir http://localhost:8765.

## Mettre l'app sur l'iPhone (GitHub Pages, gratuit)

1. Créer un dépôt sur github.com et y envoyer tout ce dossier.
2. Dans le dépôt : **Settings → Pages → Branch : main / (root) → Save**.
3. Ouvrir l'adresse `https://<ton-pseudo>.github.io/<depot>/` dans **Safari** sur l'iPhone.
4. Bouton **Partager** → **Sur l'écran d'accueil**.

L'app s'ouvre alors en plein écran, avec son icône, et fonctionne hors ligne.

## Après une modification

Incrémenter `CACHE` dans `sw.js` (ex. `quotidien-v2`) pour que l'iPhone récupère
la nouvelle version.
