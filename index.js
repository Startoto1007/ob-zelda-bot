require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, Events, EmbedBuilder, AttachmentBuilder, REST, Routes, SlashCommandBuilder, InteractionType, ChannelType } = require("discord.js");
const Canvas = require('canvas');
const path = require('path');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: ['CHANNEL', 'USER', 'MESSAGE', 'REACTION']
});

// Charger la police Hylia (place le fichier Hylia.ttf dans /fonts à la racine du projet)
Canvas.registerFont(path.join(__dirname, 'fonts/police-zelda.otf'), { family: 'Hylia' });

// --- Gestion des messages dans les salons de recrutement ---
const censures = JSON.parse(fs.readFileSync(path.join(__dirname, 'mots-censures.json'), 'utf8'));
const salonRecrutementCategory = '1413638464762675270';
const userGrossierCount = new Map();

client.on('messageCreate', async (message) => {
  // Ignore les bots ou DM
  if (message.author.bot || !message.guild) return;
  // Vérifie si c'est dans un salon de recrutement
  if (message.channel.parentId !== salonRecrutementCategory) return;
  // Vérifie si c'est le premier message après la question
  if (message.type !== 0) return;

  // --- Vérification grossièretés ---
  const lower = message.content.toLowerCase();
  let isGrossier = false;
  for (const motif of censures.grossiers_minecraft_regex) {
    const regex = new RegExp(motif, 'i');
    if (regex.test(lower)) {
      // Vérifie exceptions
      let exception = false;
      for (const ex of censures.exceptions_minecraft) {
        if (lower.includes(ex)) exception = true;
      }
      if (!exception) isGrossier = true;
    }
  }
  if (isGrossier) {
    const count = (userGrossierCount.get(message.author.id) || 0) + 1;
    userGrossierCount.set(message.author.id, count);
    if (count >= 2) {
      // Mute 2h, retire la vue, supprime le salon dans 24h
      try {
        await message.member.timeout(2 * 60 * 60 * 1000, 'Foutage de geueule dans un ticket de recrutement. | Sanction automatique.');
      } catch {}
      await message.channel.permissionOverwrites.edit(message.author.id, { ViewChannel: false });
      await message.channel.send('Trop de langage inapproprié, le ticket est fermé et tu es temporairement mute.');
      setTimeout(() => { message.channel.delete('Ticket fermé pour langage incorrect'); }, 24 * 60 * 60 * 1000);
    } else {
      await message.channel.send('Merci de rester poli, la prochaine fois je serais contraint de fermer le ticket et te mute.\nJe repose ma question : Quel est ton pseudo Minecraft ? (et cette fois-ci sans être grossier)');
    }
    return;
  }

  // --- Vérification longueur ---
  if (message.content.length > 15) {
    await message.channel.send("C'est un peu long pour un pseudo Minecraft 😅. Tu es sûr(e) de ne pas t'être trompé ? Il me faut ton pseudo Minecraft exact, sans autres mots ni Markdown");
    await message.channel.send('Je repose ma question : Quel est ton pseudo Minecraft ?');
    return;
  }
  // --- Vérification caractères valides ---
  if (!/^[a-zA-Z0-9\-_]+$/.test(message.content)) {
    const mauvais = message.content.replace(/[a-zA-Z0-9\-_]/g, '').split('').filter((v, i, a) => a.indexOf(v) === i).join(', ');
    await message.channel.send(`Un peu bizarre un pseudo Minecraft avec des "${mauvais}" non ?`);
    await message.channel.send('Je repose ma question : Quel est ton pseudo Minecraft ?');
    return;
  }
  // --- Vérification existence Mojang ---
  const pseudo = message.content;
  const fetch = require('node-fetch');
  const mojangUrl = `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(pseudo)}`;
  const mojangRes = await fetch(mojangUrl);
  if (!mojangRes.ok) {
    await message.channel.send("Après quelques recherches, ton pseudo Minecraft est introuvable, tu as dût faire une faute de frappe.");
    await message.channel.send('Je repose ma question : Quel est ton pseudo Minecraft ?');
    return;
  }
  const mojangData = await mojangRes.json();
  // --- Affichage skin ---
  await message.channel.permissionOverwrites.edit(message.author.id, { SendMessages: false });
  const uuid = mojangData.id;
  const skinUrl = `https://visage.surgeplay.com/bust/128/${uuid}`;
  const fetchImageBuffer = require('./fetchImageBuffer');
  const skinBuffer = await fetchImageBuffer(skinUrl);
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
  const attachment = new AttachmentBuilder(skinBuffer, { name: 'skin.png' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('skin_ok')
      .setLabel('Oui c\'est ça')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('skin_ko')
      .setLabel('Oups, j\'ai dut me tromper')
      .setStyle(ButtonStyle.Secondary)
  );
  await message.channel.send({
    content: 'Reconnais-tu ton skin Minecraft ?\n',
    files: [attachment],
    components: [row]
  });
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    // Message public

    // Charger l'image de fond
    const background = await Canvas.loadImage(path.join(__dirname, 'images/chateau.png'));
    // Adapter la taille du canvas à celle de l'image de fond
    const canvas = Canvas.createCanvas(background.width, background.height);
    const ctx = canvas.getContext('2d');

    // Dessiner l'arrière-plan sans redimensionnement
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

    // Avatar du membre (cercle à gauche)
    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
    const avatar = await Canvas.loadImage(avatarURL);
    // Avatar plus gros : 22% du plus petit côté
    const avatarRadius = Math.floor(Math.min(canvas.width, canvas.height) * 0.22);
    // Décalage plus à gauche
    const avatarX = Math.floor(canvas.width * 0.07); // avant 0.1
    const avatarY = Math.floor(canvas.height / 2);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarRadius, avatarY, avatarRadius, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    ctx.restore();

    // Texte à droite
    // Police plus grosse : 12% de la hauteur
    const fontSize = Math.floor(canvas.height * 0.14);
    ctx.font = `${fontSize}px Hylia`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const text = 'Bienvenue dans\nl\'OB Zelda !';
    const lines = text.split('\n');
    // Calculer la hauteur totale du bloc de texte
    const lineHeight = fontSize * 1.5;
    const totalTextHeight = lineHeight * lines.length;
    // Centrer verticalement le bloc de texte
    const textX = Math.floor(canvas.width * 0.38); // avant 0.45
    const textYStart = Math.floor((canvas.height - totalTextHeight) / 2 + lineHeight / 2);
    lines.forEach((line, i) => {
      ctx.fillText(line, textX, textYStart + i * lineHeight);
    });

    // Générer l'image finale
    const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'bienvenue.png' });

    // Créer l'embed
    const embed = new EmbedBuilder()
      .setTitle(`${member.displayName} vient d'arriver !`)
      .setImage('attachment://bienvenue.png')
      .setColor('#c3854d');

    // Envoyer dans le salon
    const channel = member.guild.channels.cache.get('1348227800355569707');
    if (channel) {
      const sentMessage = await channel.send({ content: member.user.toString(), embeds: [embed], files: [attachment] });
      // Ajouter la réaction :wave:
      await sentMessage.react('👋');
      // Modifier le message pour supprimer la mention
      await sentMessage.edit({ content: '', embeds: [embed], files: [attachment] });
    }
  } catch (err) {
    console.error('Erreur bienvenue.js :', err);
  }

  // Message privé avec règlement
  try {
    // Charger l'arrière-plan
    const regleBg = await Canvas.loadImage(path.join(__dirname, 'images/arriere-plan.png'));
    const regleWidth = 600;
    const regleHeight = 800;
    const regleCanvas = Canvas.createCanvas(regleWidth, regleHeight);
    const regleCtx = regleCanvas.getContext('2d');

    // Flouter l'arrière-plan
    regleCtx.filter = 'blur(6px)';
    regleCtx.drawImage(regleBg, 0, 0, regleWidth, regleHeight);
    regleCtx.filter = 'none';

    // Avatar en haut à gauche (cercle)
    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
    const avatar = await Canvas.loadImage(avatarURL);
    const avatarRadius = 60;
    const avatarX = 40;
    const avatarY = 60;
    regleCtx.save();
    regleCtx.beginPath();
    regleCtx.arc(avatarX + avatarRadius, avatarY + avatarRadius, avatarRadius, 0, Math.PI * 2, true);
    regleCtx.closePath();
    regleCtx.clip();
    regleCtx.drawImage(avatar, avatarX, avatarY, avatarRadius * 2, avatarRadius * 2);
    regleCtx.restore();

    // Titre à droite de l'avatar
    regleCtx.font = 'bold 38px Hylia';
    regleCtx.fillStyle = '#fff';
    regleCtx.textAlign = 'left';
    regleCtx.textBaseline = 'middle';
    regleCtx.fillText('Règlement du serveur', avatarX + avatarRadius * 2 + 30, avatarY + avatarRadius);

    // Texte du règlement avec retour à la ligne automatique
    const regleText = [
      '➢ Le respect est obligatoire. Aucun propos haineux, discriminatoire, insultant ou harcelant ne sera toléré.',
      '➢ Pas de spam, flood, troll ni provocations. Reste courtois, bienveillant et respectueux des autres.',
      '➢ Pas de publicité, en dehors du salon dédié. Il te faut ouvrir un ticket pour poster dans ce salon.',
      '➢ Tout contenu NSFW, illégal, malveillant ou choquant est strictement interdit sur ce serveur.',
      '➢ Respecte l’usage des salons prévus.',
      '➢ Le bot modère (spam, insultes, pub…). Si erreur, ouvrez un ticket pour faire vérifier la sanction.',
      '➢ Les décisions des staffs du discord doivent être respectées.'
    ];
    regleCtx.font = '17px Hylia';
    regleCtx.fillStyle = '#fff';
    regleCtx.textAlign = 'left';
    regleCtx.textBaseline = 'top';
    let textY = avatarY + avatarRadius * 2 + 40;
    const textX = 40;
    const maxWidth = regleWidth - 2 * textX;
    const lineHeight = 38;
    // Fonction pour dessiner du texte avec retour à la ligne automatique
    function drawMultilineText(ctx, text, x, y, maxWidth, lineHeight) {
      const words = text.split(' ');
      let line = '';
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
          ctx.fillText(line, x, y, maxWidth);
          line = words[n] + ' ';
          y += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, y, maxWidth);
      return y + lineHeight;
    }
    regleText.forEach(line => {
      textY = drawMultilineText(regleCtx, line, textX, textY, maxWidth, lineHeight);
    });

    // Message de fin en bas avec retour à la ligne, aligné à gauche
    regleCtx.font = 'bold 30px Hylia';
    regleCtx.textAlign = 'left';
    regleCtx.textBaseline = 'middle';
    const finalMsg = 'Merci de ta compréhension, et bon \nséjour parmi nous !';
    const finalLines = finalMsg.split('\n');
    const finalYStart = regleHeight - 80;
    finalLines.forEach((line, i) => {
      regleCtx.fillText(line, textX, finalYStart + i * 36);
    });

    // Générer l'image
    const regleAttachment = new AttachmentBuilder(regleCanvas.toBuffer('image/png'), { name: 'reglement.png' });
    // Envoyer en DM
    await member.send({ files: [regleAttachment] });
    // Envoyer le message de sécurité après le règlement
    await member.send("Pour des raisons de sécurité, tu ne peux pas écrire ni interagir dans les salons de notre serveur sans avoir un numéro de téléphone vérifié. Si tu n'as pas de téléphone personnel, tu peux envoyer un message privé à <@1303819587518726186> pour une vérification manuelle.");
  } catch (err) {
    console.error('Erreur DM règlement :', err);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    // Charger l'image de fond
    const background = await Canvas.loadImage(path.join(__dirname, 'images/chateau.png'));
    // Adapter la taille du canvas à celle de l'image de fond
    const canvas = Canvas.createCanvas(background.width, background.height);
    const ctx = canvas.getContext('2d');

    // Dessiner l'arrière-plan
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
    // Appliquer un filtre gris léger
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'hsl(0,0%,60%)';
    ctx.globalAlpha = 0.4;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    // Avatar du membre (cercle à gauche)
    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
    const avatar = await Canvas.loadImage(avatarURL);
    const avatarRadius = Math.floor(Math.min(canvas.width, canvas.height) * 0.22);
    const avatarX = Math.floor(canvas.width * 0.07);
    const avatarY = Math.floor(canvas.height / 2);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarRadius, avatarY, avatarRadius, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    ctx.restore();

    // Texte à droite
    const fontSize = Math.floor(canvas.height * 0.14);
    ctx.font = `${fontSize}px Hylia`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const text = 'À bientôt dans\nl\'OB Zelda';
    const lines = text.split('\n');
    const lineHeight = fontSize * 1.5;
    const totalTextHeight = lineHeight * lines.length;
    const textX = Math.floor(canvas.width * 0.38);
    const textYStart = Math.floor((canvas.height - totalTextHeight) / 2 + lineHeight / 2);
    lines.forEach((line, i) => {
      ctx.fillText(line, textX, textYStart + i * lineHeight);
    });

    // Générer l'image finale
    const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'depart.png' });

    // Créer l'embed
    const embed = new EmbedBuilder()
      .setTitle('Un membre nous a quitté 🫡')
      .setImage('attachment://depart.png')
      .setColor('#888888');

    // Envoyer dans le salon
    const channel = member.guild.channels.cache.get('1348227800355569707');
    if (channel) {
      const sentMessage = await channel.send({ embeds: [embed], files: [attachment] });
      // Ajouter la réaction :cry:
      await sentMessage.react('😢');
    }
  } catch (err) {
    console.error('Erreur depart.js :', err);
  }
});

// Mets ici le token de ton bot
const TOKEN = process.env.DISCORD_TOKEN;
const RECRUTEMENT_MESSAGE = process.env.RECRUTEMENT_MESSAGE;

client.once('clientReady', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);

  // Ajoute le bouton "Démarrer le recrutement" au message de recrutement
  if (RECRUTEMENT_MESSAGE) {
    try {
      // RECRUTEMENT_MESSAGE doit être au format "channelId-messageId"
      const [channelId, messageId] = RECRUTEMENT_MESSAGE.split('-');
      const channel = await client.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        // Vérifie le dernier message du salon
        const messages = await channel.messages.fetch({ limit: 1 });
        const lastMessage = messages.first();
        if (lastMessage && lastMessage.author.id === client.user.id) {
          // Le dernier message est déjà du bot, ne pas renvoyer le bouton
          return;
        }
        const message = await channel.messages.fetch(messageId);
        if (message) {
          const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('recrutement_start')
              .setLabel('Démarrer le recrutement')
              .setStyle(ButtonStyle.Primary)
          );
          // Répond au message de recrutement avec le bouton (si pas déjà fait)
          await message.reply({ content: 'Clique ici pour démarrer le process de recrutement :', components: [row] });
        }
      }
    } catch (err) {
      console.error('Erreur lors de l\'ajout du bouton recrutement :', err);
    }
  }

  // Liste des statuts à alterner
  const statuses = [
    { name: "la grandeur de l'OB", type: ActivityType.Watching },
    { name: "Hyping", type: ActivityType.Playing },
    { name: "les ordres de flaviodab", type: ActivityType.Listening },
    { name: "les vidéos de Minox", type: ActivityType.Watching },
    { name: "Dev par Startoto", type: ActivityType.Custom, state: "Dev par Startoto" }
  ];

  let i = 0;
  setInterval(() => {
    const status = statuses[i];
    client.user.setActivity(status);
    console.log(`[DEBUG] Changement de statut Discord :`, status);
    i = (i + 1) % statuses.length;
  }, 5000); // change toutes les 5 secondes
});

// Gestion des interactions pour le recrutement
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  // Gestion du bouton d'intro dans le salon de recrutement
  if (interaction.customId === 'recrutement_abort') {
    // Supprime le salon si l'utilisateur annule
    await interaction.reply({ content: 'Recrutement annulé, le salon va être supprimé.', ephemeral: true });
    setTimeout(async () => {
      try { await interaction.channel.delete('Recrutement annulé par le candidat'); } catch {}
    }, 2000);
    return;
  }
  if (interaction.customId === 'recrutement_go') {
    // Désactive le bouton "C'est parti !" et supprime l'autre
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('recrutement_go')
        .setLabel("C'est parti !")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true)
    );
    await interaction.update({ content: interaction.message.content, components: [row] });
    // Autorise l'utilisateur à écrire dans le salon
    await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SendMessages: true });
    // Pose la question sur le pseudo Minecraft
    await interaction.channel.send("Pour commencer, quel est ton pseudo Minecraft ?");
    return;
  }
  if (interaction.customId === 'recrutement_start') {
    // Affiche la confirmation en éphémère
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('recrutement_confirm')
        .setLabel('Oui !')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('recrutement_cancel')
        .setLabel("Non, j'ai missclick")
        .setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({
      content: 'Es-tu sûr de vouloir démarrer le process de recrutement ?',
      components: [row],
      ephemeral: true
    });
  } else if (interaction.customId === 'recrutement_confirm') {
    // Remplace le message éphémère par un message d'attente
    await interaction.update({ content: 'Création du salon de recrutement en cours...', components: [], ephemeral: true });

    // Récupère l'utilisateur
    const user = interaction.user;
    // Utilise displayName si < 20 caractères, sinon username
    let channelName = user.displayName || user.username;
    if (!channelName || channelName.length > 20) channelName = user.username;
    channelName = `📪・${channelName}`;

    // Crée le salon dans la catégorie 1413638464762675270
    try {
      const guild = interaction.guild;
      const categoryId = '1413638464762675270';
      // Permissions
      const { PermissionsBitField } = require('discord.js');
      const everyoneRole = guild.roles.everyone;
      const overwrites = [
        {
          id: everyoneRole.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory
          ],
          deny: [
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.CreateInstantInvite,
            PermissionsBitField.Flags.SendTTSMessages,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.MentionEveryone,
            PermissionsBitField.Flags.UseExternalEmojis,
            PermissionsBitField.Flags.AddReactions,
            PermissionsBitField.Flags.SendMessagesInThreads,
            PermissionsBitField.Flags.SendVoiceMessages,
            PermissionsBitField.Flags.SendPolls,
            PermissionsBitField.Flags.CreatePublicThreads,
            PermissionsBitField.Flags.CreatePrivateThreads,
            PermissionsBitField.Flags.UseExternalStickers,
            PermissionsBitField.Flags.ManageThreads,
            PermissionsBitField.Flags.PinMessages,
            PermissionsBitField.Flags.UseExternalApps,
            PermissionsBitField.Flags.UseApplicationCommands,
            PermissionsBitField.Flags.UseEmbeddedActivities
          ]
        }
      ];
      const channel = await guild.channels.create({
        name: channelName,
        type: 0, // 0 = GUILD_TEXT
        parent: categoryId,
        topic: `Recrutement en cours de <@${user.id}>. Questionnaire du bot.`,
        permissionOverwrites: overwrites
      });
      // Modifie le message éphémère pour donner le lien du salon
      await interaction.editReply({ content: `Le salon de recrutement a été créé avec succès, allez dans <#${channel.id}> pour continuer.`, components: [], ephemeral: true });
      // Envoie le message d'intro avec les boutons dans le salon créé
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const introRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('recrutement_go')
          .setLabel("C'est parti !")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('recrutement_abort')
          .setLabel('Finalement non...')
          .setStyle(ButtonStyle.Danger)
      );
      await channel.send({
        content: `Bonjour <@${user.id}>, je vais te poser quelques questions pour ton recrutement dans l'OB. Tes réponses seront ensuites lues par flaviodab, l'officier responsable du recrutement, ou Startoto, le chef de l'OB. Tu es toujours partant ?`,
        components: [introRow]
      });
    } catch (err) {
      await interaction.editReply({ content: `Erreur lors de la création du salon de recrutement : ${err.message}`, components: [], ephemeral: true });
    }
  } else if (interaction.customId === 'recrutement_cancel') {
    // Supprime le message de confirmation éphémère
    await interaction.update({ content: 'Demande annulée.', components: [], ephemeral: true });
    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 2000);
  }
  // Gestion des boutons de confirmation du skin Minecraft
  if (interaction.customId === 'skin_ok') {
    // Désactive uniquement le bouton "Oui c'est ça" et supprime l'autre
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('skin_ok')
        .setLabel('Oui c\'est ça')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true)
    );
    await interaction.update({ components: [row] });
    await interaction.channel.send('Merci, ta candidature va être étudiée par le staff !');
    return;
  }
  if (interaction.customId === 'skin_ko') {
    // Désactive uniquement le bouton "Oups, j'ai dut me tromper" et supprime l'autre
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('skin_ko')
        .setLabel('Oups, j\'ai dut me tromper')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await interaction.update({ components: [row] });
    await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SendMessages: true });
    await interaction.channel.send('Je repose ma question : Quel est ton pseudo Minecraft ?');
    return;
  }
});

client.login(TOKEN);
