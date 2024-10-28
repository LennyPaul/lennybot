require('dotenv').config();
const { REST, Routes } = require('discord.js');

// Créer un tableau des commandes à enregistrer
const commands = [
    {
        name: 'new_game',
        description: 'Crée une nouvelle partie',
    },
    {
        name: 'dev_on',
        description: 'Active le mode développement',
        options: [
            {
                name: 'password',
                description: 'Mot de passe pour activer le mode dev',
                type: 3, // Type 3 = STRING
                required: true,
            }
        ]
    },
    {
        name: 'dev_off',
        description: 'Désactive le mode développement',
    },
    {
        name: 'leaderboard',
        description: 'Crée ou met à jour le channel leaderboard avec le classement des joueurs par winrate',
    }
];

// Enregistrer les commandes avec l'API Discord
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Déploiement des commandes...');

        // Utilisez l'ID de votre application et l'ID du serveur (guild)
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log('Les commandes ont été enregistrées avec succès.');
    } catch (error) {
        console.error('Erreur lors du déploiement des commandes :', error);
    }
})();
