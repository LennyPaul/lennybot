require('dotenv').config();
const { REST, Routes } = require('discord.js');

// Créer un tableau des commandes à enregistrer
const commands = [
    {
        name: 'new_game',
        description: 'Crée une nouvelle partie',
    },
    {
        name: 'random_game',
        description: 'Crée une partie avec des équipes aléatoires'
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
    },
    {
        name: 'assign_role',
        description: "Assigne un joueur à une équipe et un rôle dans une partie",
        options: [
            {
                name: 'joueur',
                description: "Le joueur à assigner",
                type: 6, // Type 6 = USER
                required: true,
            },
            {
                name: 'equipe',
                description: "L'équipe à assigner (Blue ou Red)",
                type: 3, // Type 3 = STRING
                required: true,
                choices: [
                    { name: 'Blue', value: 'Blue' },
                    { name: 'Red', value: 'Red' }
                ]
            },
            {
                name: 'role',
                description: "Le rôle à assigner",
                type: 3, // Type 3 = STRING
                required: true,
                choices: [
                    { name: 'TOP', value: 'TOP' },
                    { name: 'JGL', value: 'JGL' },
                    { name: 'MID', value: 'MID' },
                    { name: 'ADC', value: 'ADC' },
                    { name: 'SUPP', value: 'SUPP' }
                ]
            }
        ]
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
