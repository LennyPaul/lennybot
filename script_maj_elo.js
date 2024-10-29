require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoClient = new MongoClient(process.env.MONGO_URI);

async function updateEloForAllPlayers() {
    try {
        // Connexion à la base de données MongoDB
        await mongoClient.connect();
        const db = mongoClient.db('discord_bot'); // Remplacez par le nom de votre base de données
        const joueursCollection = db.collection('joueurs');

        // Récupérer tous les joueurs de la collection
        const joueurs = await joueursCollection.find().toArray();

        // Mettre à jour l'elo de chaque joueur
        for (const joueur of joueurs) {
            const { victoires, defaites, discordId } = joueur;

            // Calculer l'elo basé sur 200 de base, +25 par victoire, -15 par défaite
            const elo = 200 + (victoires * 25) - (defaites * 15);

            // Mettre à jour l'elo du joueur dans la base de données
            await joueursCollection.updateOne(
                { discordId: discordId },
                { $set: { elo: elo } }
            );

            console.log(`Elo mis à jour pour ${discordId}: ${elo}`);
        }

        console.log('Mise à jour de l\'elo terminée pour tous les joueurs.');

    } catch (error) {
        console.error('Erreur lors de la mise à jour de l\'elo des joueurs :', error);
    } finally {
        await mongoClient.close();
    }
}

// Exécuter la fonction pour mettre à jour l'elo des joueurs
updateEloForAllPlayers();
