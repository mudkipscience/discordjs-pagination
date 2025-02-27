import {
    ButtonInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ComponentType,
    InteractionType,
    EmbedBuilder,
    BaseGuildTextChannel,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ModalActionRowComponentBuilder,
    ModalSubmitInteraction
} from "discord.js";
import { TypesButtons, StylesButton, ButtonsValues, PaginationOptions } from "./pagination.i";

const defaultEmojis = {
    first: "⬅️",
    previous: "◀️",
    next: "▶️",
    last: "➡️",
    number: "#️⃣"
}

const defaultStyles = {
    first: StylesButton.Primary,
    previous: StylesButton.Primary,
    next: StylesButton.Primary,
    last: StylesButton.Primary,
    number: StylesButton.Success
}

export const pagination = async (options: PaginationOptions) => {
    const { interaction, message, ephemeral, author, disableButtons, embeds, buttons, time, max, customFilter, fastSkip, pageTravel } = options
    let currentPage = 1;
    const disableB = disableButtons || false;
    const ephemeralMessage = ephemeral !== null ? ephemeral : false;

    if (!interaction && !message) throw new Error("Pagination requires either an interaction or a message object");
    const type = interaction ? 'interaction' : 'message';

    const getButtonData = (value: ButtonsValues) => {
        return buttons?.find((btn) => btn.value === value);
    }

    const resolveButtonName = (value: ButtonsValues) => {
        return (Object.keys(TypesButtons) as (keyof typeof TypesButtons)[]).find((key) => {
            return TypesButtons[key] === value;
        });
    }

    const generateButtons = (state?: boolean) => {
        const checkState = (value: ButtonsValues) => {
            if (([1, 2]).includes(value) && currentPage === 1) return true;
            if (([5]).includes(value) && currentPage === 1 && embeds.length === 1) return true;
            return ([3, 4]).includes(value) && currentPage === embeds.length;
        }

        let names: ButtonsValues[] = [2, 3];
        if (fastSkip) names = [1, ...names, 4];
        if (pageTravel) names.push(5);

        return names.reduce(
            (accumulator: ButtonBuilder[], value: ButtonsValues) => {
                let embed = new ButtonBuilder()
                    .setCustomId(value.toString())
                    .setDisabled(state || checkState(value))
                    .setStyle(getButtonData(value)?.style || defaultStyles[resolveButtonName(value)]);
                if (getButtonData(value)?.emoji !== null) embed.setEmoji(getButtonData(value)?.emoji || defaultEmojis[resolveButtonName(value)])
                if (getButtonData(value)?.label) embed.setLabel(getButtonData(value)?.label);
                accumulator.push(embed);
                return accumulator;
            },
            []
        );
    }

    const components = (state?: boolean) => [
        new ActionRowBuilder<ButtonBuilder>().addComponents(generateButtons(state))
    ]

    const changeFooter = () => {
        const embed = embeds[currentPage - 1];
        const newEmbed = new EmbedBuilder(embed.toJSON());
        if (embed?.footer?.text) {
            return newEmbed.setFooter({
                text: `${embed.footer.text} - Page ${currentPage} / ${embeds.length}`
            });
        }
        return newEmbed.setFooter({
            text: `Page ${currentPage} / ${embeds.length}`
        });
    }

    let initialMessage;
    let channel: BaseGuildTextChannel = message?.channel as BaseGuildTextChannel || interaction?.channel as BaseGuildTextChannel;

    if (type === 'interaction' && channel) {
        if (interaction.type === InteractionType.ApplicationCommand) {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferReply({ ephemeral: ephemeralMessage });
            }
            initialMessage = await interaction.editReply({
                embeds: [changeFooter()],
                components: components()
            });
        }
    } else {
        initialMessage = await channel.send({
            embeds: [changeFooter()],
            components: components()
        });
    }

    const defaultFilter = (interaction: ButtonInteraction) => {
        return interaction.user.id === author.id && parseInt(interaction.customId) <= 4;
    }

    const collectorOptions = (filter?): any => {
        const opt = {
            filter: filter || customFilter || defaultFilter,
            componentType: ComponentType.Button
        }
        if (max) opt["max"] = max;
        if (time) opt["time"] = time;
        return opt;
    }

    const collector = initialMessage.createMessageComponentCollector(collectorOptions());
    let collectorModal;

    if (pageTravel) {
        collectorModal = initialMessage.createMessageComponentCollector(collectorOptions((_i: ModalSubmitInteraction) => _i.user.id === author.id && parseInt(_i.customId) === 5));
        collectorModal.on("collect", async (ButtonInteraction) => {
            // Show modal
            const modal = new ModalBuilder()
                .setCustomId('choose_page_modal')
                .setTitle('Choose Page');

            const inputPageNumber = new TextInputBuilder()
                .setCustomId('page_number')
                .setLabel('Enter Page Number')
                .setStyle(TextInputStyle.Short)

            const buildModal = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(inputPageNumber);
            modal.addComponents(buildModal);
            await ButtonInteraction.showModal(modal);

            await ButtonInteraction.awaitModalSubmit({
                filter: (_i: ButtonInteraction) => _i.user.id === author.id && _i.customId === 'choose_page_modal',
                time: 30000,
            }).then(async (i) => {
                const page_number = i.fields.getTextInputValue('page_number');
                const int = parseInt(page_number);
                if (isNaN(int)) return i.followUp({
                    content: `${i.member.user}, Please enter a valid page number!\n\`${page_number}\` is not a valid page number!`,
                    ephemeral: true
                });
                int > embeds.length ? currentPage = embeds.length : int < embeds.length ? currentPage = 1 : currentPage = int;
                await i.update({
                    embeds: [changeFooter()],
                    components: components(),
                    ephemeral: ephemeralMessage
                });
            });
        });
    }

    collector.on("collect", async (interaction: ButtonInteraction) => {
        const value = parseInt(interaction.customId) as ButtonsValues;

        switch (value) {
            case 1: currentPage = 1; break;
            case 2: currentPage--; break;
            case 3: currentPage++; break;
            case 4: currentPage = embeds.length; break;
        }

        await interaction.update({
            embeds: [changeFooter()],
            components: components()
        });
    });

    collector.on("end", () => {
        if (type === 'message') {
            initialMessage.edit({
                components: disableB ? components(true) : []
            });
        } else {
            interaction.editReply({
                components: disableB ? components(true) : []
            });
        }
    });
}
