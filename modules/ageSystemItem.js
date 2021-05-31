import * as Dice from "./dice.js";

export class ageSystemItem extends Item {

    // Check if Item can cause damage
    get hasDamage() {
        const type = this.data.type;
        if (type === "weapon") {return true};
        if (type === "power" && this.data.data.causeDamage === true) {return true};
        return false;
    };

    // Check if Item heals
    get hasHealing() {
        const type = this.data.type;
        if (type === "power" && this.data.data.causeHealing === true) {return true};
        return false;
    }

    // Check if Item requires Fatigue roll to be used
    get hasFatigue() {
        if (this.data.type === "power") {return game.settings.get("age-system", "useFatigue")};
        return false;
    };
    
    /** @override */
    prepareBaseData() {
        // super.prepareData();
        
        if (this.data.img === "icons/svg/item-bag.svg") {
            if (!CONFIG.ageSystem.itemIcons[this.data.type]) this.data.img = "icons/svg/item-bag.svg";
            this.data.img = CONFIG.ageSystem.itemIcons[this.data.type];
        };
        if (!this.data.name) this.data.name = "New " + game.i18n.localize(this.data.type);
        
        const itemData = this.data;
        const data = itemData.data;
        const itemType = itemData.type;

        data.colorScheme = `colorset-${game.settings.get("age-system", "colorScheme")}`;
        data.nameLowerCase = itemData.name.toLowerCase();
        // data.useFocusActorId = this._idFocusToUse(itemType, data.useFocus);

        // Adding common data for Power and Weapon
        if (["power", "weapon"].includes(itemType)) {
            data.useFocusActorId = data.useFocus && this.actor?.data ? this.actor.checkFocus(data.useFocus).id : null;
            data.useFocusActor = this.actor?.data ? this.actor.checkFocus(data.useFocus) : null;
            data.hasDamage = this.hasDamage;
            data.hasHealing = this.hasHealing;
            data.hasFatigue = this.hasFatigue;

            // Adds value to represent portion added to dice on damage roll
            if (this.isOwned && this.actor?.data) {
                if (data.dmgAbl) {
                    if (data.dmgAbl !== "no-abl") {
                        data.ablDamageValue = this.actor.data.data.abilities[data.dmgAbl].total;
                    }
                }
                if (data.damageResisted) {
                    if (data.damageResisted.dmgAbl !== "no-abl") {
                        data.damageResisted.ablDamageValue = this.actor.data.data.abilities[data.damageResisted.dmgAbl].total;
                    }                
                }
            };
        }

        switch (itemType) {
            case "focus": return this._prepareFocus(data);
            case "power": return this._preparePower(data);
            case "shipfeatures": return this._prepareShipFeatures(data);
        }

        this.prepareEmbeddedEntities();        
    };

    _prepareFocus(data) {
        data.finalValue = data.improved ? data.initialValue + 1 : data.initialValue;
        if (this.isOwned && this.actor?.data) {
            const focusBonus = this.actor.data.data.ownedMods?.focus;
            if (focusBonus) {
                for (let f = 0; f < focusBonus.length; f++) {
                    const bonus = focusBonus[f];
                    if (data.nameLowerCase === bonus.name.toLowerCase()) data.finalValue += bonus.value;
                }
            }
        }
    }

    _preparePower(data) {
        const useFatigue = game.settings.get("age-system", "useFatigue");
        if (!useFatigue) {data.useFatigue = false};

        // Calculate Item Force
        data.itemForce = 10;
        if (data.itemMods.powerForce.isActive && data.itemMods.powerForce.isSelected) {data.itemForce += data.itemMods.powerForce.value};
        // Adds ability to itemForce
        if (this.actor?.data) {
            if ((data.itemForceAbl !== "") && (data.itemForceAbl !== "no-abl")) {
                data.itemForce += this.actor.data.data.abilities[data.itemForceAbl].total;
            };
            data.itemForce += data.useFocusActor.value;
        };

        // Calculate Fatigue TN if it is not a manual input
        if (data.inputFatigueTN === false) {data.fatigueTN = 9 + Math.floor(Number(data.powerPointCost)/2)};
    }

    _prepareShipFeatures(data) {};

    // Rolls damage for the item
    rollDamage({
        event = null,
        stuntDie = null,
        addFocus = false,
        atkDmgTradeOff = 0,
        resistedDmg = false}={}) {

        if (!this.data.data.hasDamage && !this.data.data.hasHealing) {return false};

        const damageData = {
            event: event,
            item: this,
            stuntDie: stuntDie,
            addFocus: addFocus,
            atkDmgTradeOff: atkDmgTradeOff,
            resistedDmg: resistedDmg,
            actorDmgMod: this.actor ? this.actor.data.data.dmgMod : 0
        };
        return Dice.itemDamage(damageData);
    };

    // Roll item and check targetNumbers
    roll(event, rollType = null, targetNumber = null) {
        /**Roll Type Possibilities
         * - fatigue
         * - attack
         * - powerActivation
         */
        const owner = this.actor;
        if (!owner) {return false;}
        let ablCode = (rollType === "fatigue") ? this.data.data.ablFatigue : this.data.data.useAbl;

        if (rollType === null) {
            switch (this.type) {
                case "weapon":
                    rollType = "attack"
                    break;
                case "power":
                    rollType = "powerActivation"
                default:
                    break;
            }
        }
        
        if (targetNumber === null) {
            switch (rollType) {
                case "fatigue":
                    ablCode = this.data.data.ablFatigue;
                    targetNumber = this.data.data.fatigueTN ? this.data.data.fatigueTN : null;
                    break;
                
                case "powerActivation":
                    targetNumber = this.data.data.targetNumber ? this.data.data.targetNumber : null;
                    break;
    
                case "attack":
                    const targets = game.user.targets;
                    if (targets.size === 0) break;
                    if (targets.size > 1) {
                        // TODO - add case for multiple targets attacked
                        let warning = game.i18n.localize("age-system.WARNING.selectOnlyOneTarget");
                        ui.notifications.warn(warning);
                        return;
                    } else {
                        const targetId = targets.ids[0];
                        const targetToken = canvas.tokens.placeables.find(t => t.data.id === targetId);
                        targetNumber = targetToken.actor.data.data.defense.total;
                    }
                    break;
        
                default:
                    break;
            }
        }

        const rollData = {
            event: event,
            actor: owner,
            abl: ablCode,
            itemRolled: this,
            rollTN: targetNumber,
            rollType
        }
        Dice.ageRollCheck(rollData);
    };

    chatTemplate = {
        "weapon": "systems/age-system/templates/sheets/weapon-sheet.hbs",
        "focus": "systems/age-system/templates/sheets/focus-sheet.hbs",
        "stunts": "systems/age-system/templates/sheets/stunts-sheet.hbs",
        "talent": "systems/age-system/templates/sheets/talent-sheet.hbs",
        "equipment": "systems/age-system/templates/sheets/equipment-sheet.hbs",
        "power": "systems/age-system/templates/sheets/power-sheet.hbs",
        "relationship": "systems/age-system/templates/sheets/relationship-sheet.hbs",
        "honorifics": "systems/age-system/templates/sheets/honorifics-sheet.hbs",
        "membership": "systems/age-system/templates/sheets/membership-sheet.hbs",
        "shipfeatures": "systems/age-system/templates/sheets/shipfeatures-sheet.hbs"
    };

    async showItem() {
        
        const cardData = {
            inChat: true,
            name: this.data.name,
            data: this.data,
            item: this,
            owner: this.actor,
            colorScheme: game.settings.get("age-system", "colorScheme"),
            config: {wealthMode: game.settings.get("age-system", "wealthType")}
        };
        const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            roll: false,
            content: await renderTemplate(this.chatTemplate[this.type], cardData)
        };
        return ChatMessage.create(chatData);
    };
};