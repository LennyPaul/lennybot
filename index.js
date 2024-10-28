require('dotenv').config();
const { MongoClient } = require('mongodb');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');

// Initialisation du bot Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const parties = {};
let devMode = false;  // Variable pour suivre l'état du mode développement

// Connexion à MongoDB
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient.connect()
  .then(client => {
    console.log('Connecté à MongoDB');
    db = client.db('discord_bot'); // Nom de la base de données
  })
  .catch(error => console.error('Erreur de connexion à MongoDB :', error));

// Fonction pour calculer et trier les joueurs par winrate
async function getLeaderboard() {
    const joueursCollection = db.collection('joueurs');
    const joueurs = await joueursCollection.find().toArray();

    // Calculer le winrate pour chaque joueur et trier par winrate décroissant
    const leaderboard = joueurs
        .map(joueur => {
            const totalGames = joueur.victoires + joueur.defaites;
            const winrate = totalGames > 0 ? (joueur.victoires / totalGames) * 100 : 0;
            return {
                discordId: joueur.discordId,
                victoires: joueur.victoires,
                defaites: joueur.defaites,
                winrate: winrate.toFixed(2)  // Garder deux décimales
            };
        })
        .sort((a, b) => b.winrate - a.winrate);

    return leaderboard;
}

// Création du channel et affichage du leaderboard
// Fonction pour créer et afficher le leaderboard avec un embed
async function createLeaderboardChannel(guild) {
    try {
        // Vérifier si un channel "leaderboard" existe déjà, sinon le créer
        let leaderboardChannel = guild.channels.cache.find(channel => channel.name === 'leaderboard');
        if (!leaderboardChannel) {
            leaderboardChannel = await guild.channels.create({
                name: 'leaderboard',
                type: 0, // Type 'GUILD_TEXT' (canal textuel)
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        allow: [PermissionsBitField.Flags.ViewChannel],
                        deny: [PermissionsBitField.Flags.SendMessages]
                    }
                ]
            });
        }

        // Obtenir le leaderboard trié par winrate
        const leaderboard = await getLeaderboard();

        // Si aucun joueur n'est trouvé
        if (leaderboard.length === 0) {
            await leaderboardChannel.send('Aucun joueur n\'a encore participé à une partie.');
            return;
        }

        // Créer un embed pour afficher le leaderboard
        const leaderboardEmbed = new EmbedBuilder()
            .setTitle('🏆 Leaderboard des joueurs')
            .setDescription('Classement des joueurs basé sur leur taux de victoires (winrate)')
            .setColor(0x00AE86)
            .setTimestamp()
            .setFooter({ text: 'Dernière mise à jour', iconURL: guild.iconURL() });

        // Ajouter les champs pour chaque joueur
        leaderboard.forEach((joueur, index) => {
            const playerField = `**#${index + 1}** - ${joueur.discordId}\n`
                + `Victoires: **${joueur.victoires}**\n`
                + `Défaites: **${joueur.defaites}**\n`
                + `Winrate: **${joueur.winrate}%**`;

            leaderboardEmbed.addFields({ name: '\u200b', value: playerField });  // \u200b est un espace vide pour structurer l'embed
        });

        // Envoyer ou mettre à jour le message dans le channel leaderboard
        const existingMessages = await leaderboardChannel.messages.fetch();
        if (existingMessages.size > 0) {
            const firstMessage = existingMessages.first();
            await firstMessage.edit({ embeds: [leaderboardEmbed] });
        } else {
            await leaderboardChannel.send({ embeds: [leaderboardEmbed] });
        }

        console.log('Leaderboard mis à jour avec un embed');
    } catch (error) {
        console.error('Erreur lors de la création du channel leaderboard :', error);
    }
}


// Enregistrement des statistiques de chaque joueur
async function enregistrerStatistiquesJoueurs(channelId, gagnant) {
    const partie = parties[channelId];
    const joueursCollection = db.collection('joueurs');

    const equipes = { gagnante: partie[gagnant], perdante: partie[gagnant === 'Blue' ? 'Red' : 'Blue'] };

    // Mise à jour pour chaque équipe
    for (const [statut, equipe] of Object.entries(equipes)) {
        const isWin = statut === 'gagnante';

        for (const role in equipe) {
            const joueurId = equipe[role];
            if (joueurId) {
                try {
                    const joueur = await joueursCollection.findOne({ discordId: joueurId });
                    if (joueur) {
                        // Mettre à jour les statistiques existantes
                        const update = {
                            $inc: {
                                victoires: isWin ? 1 : 0,
                                defaites: isWin ? 0 : 1
                            }
                        };
                        await joueursCollection.updateOne({ discordId: joueurId }, update);
                        console.log(`Statistiques mises à jour pour ${joueurId}`);
                    } else {
                        // Créer un nouveau joueur
                        const nouveauJoueur = {
                            discordId: joueurId,
                            victoires: isWin ? 1 : 0,
                            defaites: isWin ? 0 : 1
                        };
                        await joueursCollection.insertOne(nouveauJoueur);
                        console.log(`Nouveau joueur créé : ${joueurId}`);
                    }
                } catch (error) {
                    console.error(`Erreur lors de la mise à jour des statistiques du joueur ${joueurId} :`, error);
                }
            }
        }
    }
}

// Enregistrement d'une partie dans la base MongoDB
async function enregistrerPartie(channelId, gagnant) {
    const partie = parties[channelId];
    const historiqueCollection = db.collection('historique_parties');

    const partieData = {
        equipeBlue: partie.Blue,
        equipeRed: partie.Red,
        gagnant: gagnant,
        date: new Date()
    };

    try {
        await historiqueCollection.insertOne(partieData);
        console.log('Partie enregistrée dans MongoDB');
    } catch (error) {
        console.error('Erreur lors de l\'enregistrement de la partie :', error);
    }

    // Mettre à jour les statistiques des joueurs après l'enregistrement de la partie
    await enregistrerStatistiquesJoueurs(channelId, gagnant);

    // Mise à jour automatique du leaderboard après chaque partie
    const guild = client.guilds.cache.get(process.env.GUILD_ID);  // Obtenez la guild via son ID
    await createLeaderboardChannel(guild);
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'new_game') {
        const channelId = interaction.channel.id;
        parties[channelId] = {
            Blue: { TOP: null, JGL: null, MID: null, ADC: null, SUPP: null },
            Red: { TOP: null, JGL: null, MID: null, ADC: null, SUPP: null },
            messageId: null,
            finished: false
        };

        const recapMessage = await interaction.reply({
            content: "Nouvelle partie créée ! Cliquez sur un rôle pour rejoindre une équipe.",
            embeds: [generateRecapEmbed(channelId)],
            components: generateButtons(channelId),
            fetchReply: true
        });

        parties[channelId].messageId = recapMessage.id;
    }

    // Commande pour créer le leaderboard
    if (commandName === 'leaderboard') {
        await interaction.deferReply({ ephemeral: true });
        await createLeaderboardChannel(interaction.guild);
        await interaction.followUp({ content: 'Le leaderboard a été mis à jour.', ephemeral: true });
    }

    // Activation du mode dev
    if (commandName === 'dev_on') {
        const password = interaction.options.getString('password');
        if (password === process.env.DEV_PASSWORD) {
            devMode = true;
            await interaction.reply({ content: "Mode développement activé.", ephemeral: true });
        } else {
            await interaction.reply({ content: "Mot de passe incorrect.", ephemeral: true });
        }
    }

    // Désactivation du mode dev
    if (commandName === 'dev_off') {
        devMode = false;
        await interaction.reply({ content: "Mode développement désactivé.", ephemeral: true });
        if (parties[interaction.channel.id]) {
            updateButtons(interaction.channel, interaction.channel.id);
        }
    }
});

// Gestion des clics de bouton
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [team, role] = interaction.customId.split('_');
    const channelId = interaction.channel.id;
    const userId = interaction.user.id;

    if (!parties[channelId]) {
        await interaction.reply({ content: "Aucune partie active dans ce canal. Utilisez /new_game pour en créer une.", ephemeral: true });
        return;
    }

    if (parties[channelId].finished) {
        await interaction.reply({ content: "La partie est déjà terminée.", ephemeral: true });
        return;
    }

    if (role === 'WIN') {
        const otherTeam = team === 'Blue' ? 'Red' : 'Blue';
        parties[channelId].finished = true;

        // Enregistrer la partie dans MongoDB
        await enregistrerPartie(channelId, team);

        await interaction.reply({ content: `L'équipe ${team} a gagné la partie !`, ephemeral: false });

        const recapMessage = await interaction.channel.messages.fetch(parties[channelId].messageId);
        await recapMessage.edit({
            content: "La partie est terminée.",
            embeds: [
                new EmbedBuilder()
                    .setTitle("Résultat de la partie")
                    .addFields(
                        { name: `Équipe ${team} - Victoire`, value: formatTeamRoles(parties[channelId][team]), inline: true },
                        { name: `Équipe ${otherTeam} - Défaite`, value: formatTeamRoles(parties[channelId][otherTeam]), inline: true }
                    )
                    .setColor(team === 'Blue' ? 0x0000FF : 0xFF0000)
            ],
            components: []
        });

        return;
    }

    const oppositeTeam = team === 'Blue' ? 'Red' : 'Blue';
    if (!devMode && Object.values(parties[channelId][oppositeTeam]).includes(`<@${userId}>`)) {
        await interaction.reply({ content: "Vous ne pouvez rejoindre qu'une seule équipe. Veuillez quitter l'autre équipe avant de rejoindre celle-ci.", ephemeral: true });
        return;
    }

    const currentRoleHolder = parties[channelId][team][role];

    if (currentRoleHolder === `<@${userId}>`) {
        parties[channelId][team][role] = null;
        await interaction.reply({ content: `Vous avez quitté ${team} pour le rôle ${role}.`, ephemeral: true });
    } else if (!devMode && Object.values(parties[channelId][team]).includes(`<@${userId}>`)) {
        await interaction.reply({ content: "Vous êtes déjà dans un rôle dans cette équipe. Veuillez quitter votre rôle actuel avant d'en rejoindre un autre.", ephemeral: true });
    } else {
        parties[channelId][team][role] = `<@${userId}>`;
        await interaction.reply({ content: `Vous avez rejoint ${team} en tant que ${role}!`, ephemeral: true });
    }

    updateButtons(interaction.channel, channelId);
});

// Fonction pour générer l'embed du récapitulatif des équipes
function generateRecapEmbed(channelId) {
    const partie = parties[channelId];
    return new EmbedBuilder()
        .setTitle("Composition des équipes")
        .addFields(
            { name: 'Équipe Blue', value: formatTeamRoles(partie.Blue), inline: true },
            { name: 'Équipe Red', value: formatTeamRoles(partie.Red), inline: true }
        )
        .setColor(0x00AE86);
}

// Fonction pour formater les rôles de chaque équipe
function formatTeamRoles(equipe) {
    return `TOP: ${equipe.TOP || 'Libre'}\nJGL: ${equipe.JGL || 'Libre'}\nMID: ${equipe.MID || 'Libre'}\nADC: ${equipe.ADC || 'Libre'}\nSUPP: ${equipe.SUPP || 'Libre'}`;
}

// Fonction pour générer les boutons avec les boutons WIN dans l'ordre spécifié
function generateButtons(channelId) {
    const partie = parties[channelId];
    const allRolesFilled = Object.values(partie.Blue).every(position => position) && Object.values(partie.Red).every(position => position);

    const rowBlueRoles = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('Blue_TOP').setLabel('TOP').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('Blue_JGL').setLabel('JGL').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('Blue_MID').setLabel('MID').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('Blue_ADC').setLabel('ADC').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('Blue_SUPP').setLabel('SUPP').setStyle(ButtonStyle.Primary)
        );

    const rowRedRoles = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('Red_TOP').setLabel('TOP').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('Red_JGL').setLabel('JGL').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('Red_MID').setLabel('MID').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('Red_ADC').setLabel('ADC').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('Red_SUPP').setLabel('SUPP').setStyle(ButtonStyle.Danger)
        );

    const rows = [rowBlueRoles, rowRedRoles];

    // Affiche les boutons WIN BLUE et WIN RED sur la même ligne uniquement si tous les rôles des deux équipes sont remplis
    if (allRolesFilled || devMode) {
        const winRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('Blue_WIN').setLabel('WIN BLUE').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('Red_WIN').setLabel('WIN RED').setStyle(ButtonStyle.Success)
        );
        rows.push(winRow);
    }

    return rows;
}

// Fonction pour mettre à jour les boutons dynamiquement
async function updateButtons(channel, channelId) {
    const recapMessage = await channel.messages.fetch(parties[channelId].messageId);
    await recapMessage.edit({ embeds: [generateRecapEmbed(channelId)], components: generateButtons(channelId) });
}

client.login(process.env.DISCORD_TOKEN);
