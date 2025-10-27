const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bot-owner')
        .setDescription('Bot owner exclusive commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-global-category')
                .setDescription('[Owner Only] Add a default category available to all servers')
                .addStringOption(option =>
                    option
                        .setName('id')
                        .setDescription('Unique ID for category (lowercase, no spaces)')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('label')
                        .setDescription('Display name for the category')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('emoji')
                        .setDescription('Emoji for the category')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('Description of what this category is for')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-global-category')
                .setDescription('[Owner Only] Remove a default category from all servers')
                .addStringOption(option =>
                    option
                        .setName('id')
                        .setDescription('ID of the category to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list-global-categories')
                .setDescription('[Owner Only] View all default categories'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('[Owner Only] View bot-wide statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('servers')
                .setDescription('[Owner Only] List all servers using the bot')),
    
    async execute(interaction, client) {
        const isBotOwner = interaction.client.application.owner?.id === interaction.user.id ||
                          (interaction.client.application.owner?.ownerId && 
                           interaction.user.id === interaction.client.application.owner.ownerId);
        const isServerOwner = interaction.user.id === interaction.guild.ownerId;
        
        if (!isBotOwner && !isServerOwner) {
            return interaction.reply({
                content: '❌ This command is only available to the bot owner or server owner.',
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'add-global-category': {
                const fs = require('fs');
                const path = require('path');
                
                const id = interaction.options.getString('id').toLowerCase().replace(/[^a-z0-9_]/g, '');
                const label = interaction.options.getString('label');
                const emoji = interaction.options.getString('emoji');
                const description = interaction.options.getString('description');

                if (config.ticketCategories[id]) {
                    return interaction.reply({
                        content: '❌ A default category with this ID already exists.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                config.ticketCategories[id] = {
                    label,
                    emoji,
                    description
                };

                const configPath = path.join(__dirname, '..', 'config.json');
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

                await interaction.reply({
                    content: `✅ Added global default category: ${emoji} **${label}** (${id})\n\nThis category is now available for all servers to enable.`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'remove-global-category': {
                const fs = require('fs');
                const path = require('path');
                
                const id = interaction.options.getString('id');

                if (!config.ticketCategories[id]) {
                    return interaction.reply({
                        content: '❌ Default category not found.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const category = config.ticketCategories[id];
                delete config.ticketCategories[id];

                const configPath = path.join(__dirname, '..', 'config.json');
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

                const allConfigs = client.database.readJSON(client.database.configFile);
                let affectedServers = 0;
                Object.keys(allConfigs).forEach(guildId => {
                    const serverConfig = allConfigs[guildId];
                    if (serverConfig.enabledCategories && serverConfig.enabledCategories.includes(id)) {
                        serverConfig.enabledCategories = serverConfig.enabledCategories.filter(catId => catId !== id);
                        affectedServers++;
                    }
                });
                
                if (affectedServers > 0) {
                    client.database.writeJSON(client.database.configFile, allConfigs);
                }

                await interaction.reply({
                    content: `✅ Removed global default category: ${category.emoji} **${category.label}**\n\n🔄 Automatically disabled in ${affectedServers} server(s).`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'list-global-categories': {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.primary)
                    .setTitle('🌐 Global Default Categories')
                    .setDescription('These categories are available for all servers to enable.')
                    .setTimestamp();

                if (Object.keys(config.ticketCategories).length === 0) {
                    embed.setDescription('No default categories configured. All servers must create custom categories.');
                } else {
                    const categoriesList = Object.entries(config.ticketCategories)
                        .map(([id, cat]) => `${cat.emoji} **${cat.label}** (${id})\n${cat.description}`)
                        .join('\n\n');
                    
                    embed.addFields({ name: 'Default Categories', value: categoriesList, inline: false });
                }

                await interaction.reply({
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'stats': {
                const guilds = client.guilds.cache;
                const totalTickets = Object.keys(client.database.readJSON(client.database.ticketsFile)).length;
                const totalFeedback = client.database.readJSON(client.database.feedbackFile).length;

                let totalOpenTickets = 0;
                let totalClosedTickets = 0;
                guilds.forEach(guild => {
                    const stats = client.database.getTicketStats(guild.id);
                    totalOpenTickets += stats.openTickets;
                    totalClosedTickets += stats.totalTickets - stats.openTickets;
                });

                const embed = new EmbedBuilder()
                    .setColor(config.colors.info)
                    .setTitle('📊 Bot-Wide Statistics')
                    .addFields(
                        { name: '🖥️ Servers', value: guilds.size.toString(), inline: true },
                        { name: '👥 Total Users', value: guilds.reduce((acc, guild) => acc + guild.memberCount, 0).toString(), inline: true },
                        { name: '🎫 Total Tickets', value: totalTickets.toString(), inline: true },
                        { name: '🟢 Open Tickets', value: totalOpenTickets.toString(), inline: true },
                        { name: '🔒 Closed Tickets', value: totalClosedTickets.toString(), inline: true },
                        { name: '⭐ Total Feedback', value: totalFeedback.toString(), inline: true }
                    )
                    .setFooter({ text: `Bot Owner: ${interaction.user.tag}` })
                    .setTimestamp();

                await interaction.reply({
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'servers': {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const guilds = Array.from(client.guilds.cache.values())
                    .sort((a, b) => b.memberCount - a.memberCount)
                    .slice(0, 20);

                const embed = new EmbedBuilder()
                    .setColor(config.colors.info)
                    .setTitle('🖥️ Server List')
                    .setDescription(`Showing top ${guilds.length} servers by member count`)
                    .setTimestamp();

                let serverList = '';
                guilds.forEach((guild, index) => {
                    const stats = client.database.getTicketStats(guild.id);
                    serverList += `**${index + 1}.** ${guild.name}\n`;
                    serverList += `   👥 ${guild.memberCount} members | 🎫 ${stats.totalTickets} tickets\n`;
                });

                embed.addFields({ name: 'Servers', value: serverList || 'No servers', inline: false });
                embed.setFooter({ text: `Total servers: ${client.guilds.cache.size}` });

                await interaction.editReply({
                    embeds: [embed]
                });
                break;
            }
        }
    }
};
