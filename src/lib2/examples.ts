/**
 * Example Usage of Mustang API
 * 
 * This file demonstrates how to use the comprehensive Mustang API
 * with all the new features including event system, preset management,
 * and high-level control methods.
 */

import { MustangAPI } from './api';
import { AMP_MODELS, EFFECT_MODELS, CABINET_MODELS } from './models';
import { percentToByte, byteToPercent } from './types';

// ==========================================
// BASIC SETUP
// ==========================================

async function basicSetup() {
    const api = new MustangAPI();

    // Connect to amp (monitoring and state sync happen automatically)
    const connected = await api.connect();
    if (!connected) {
        console.error('Failed to connect to amplifier');
        return;
    }

    // That's it! The amp is now connected and synced.
    // No need to call monitorPhysicalChanges() or refreshState() manually.
}

// ==========================================
// EVENT SYSTEM
// ==========================================

function setupEventListeners(api: MustangAPI) {
    // Listen for connection events
    api.on('connected', () => {
        console.log('🎸 Amplifier connected!');
    });

    api.on('disconnected', () => {
        console.log('🔌 Amplifier disconnected');
    });

    // Listen for amp changes
    api.on('amp-changed', (model, knobs) => {
        console.log(`🎛️ Amp changed to: ${model}`);
        console.log('Knobs:', knobs);
        // Update UI here
        updateAmpUI(model, knobs);
    });

    // Listen for effect changes
    api.on('effect-changed', (slot, model, knobs) => {
        console.log(`🎚️ Effect in slot ${slot} changed to: ${model}`);
        console.log('Knobs:', knobs);
        // Update UI here
        updateEffectUI(slot, model, knobs);
    });

    // Listen for bypass toggles
    api.on('bypass-toggled', (slot, enabled) => {
        console.log(`⚡ Slot ${slot} ${enabled ? 'enabled' : 'bypassed'}`);
        // Update UI here
        updateBypassIndicator(slot, enabled);
    });

    // Listen for preset loads
    api.on('preset-loaded', (slot, name) => {
        console.log(`💾 Loaded preset ${slot}: "${name}"`);
        // Update UI here
        updatePresetDisplay(slot, name);
    });

    // Listen for cabinet changes
    api.on('cabinet-changed', (cabinetName) => {
        console.log(`📦 Cabinet changed to: ${cabinetName}`);
        // Update UI here
        updateCabinetDisplay(cabinetName);
    });

    // Listen for any state changes (useful for general UI updates)
    api.on('state-changed', () => {
        console.log('🔄 State changed');
        // Refresh entire UI here
        refreshUI();
    });
}

// ==========================================
// AMP CONTROL
// ==========================================

async function ampControlExamples(api: MustangAPI) {
    // Set amp model by ID (primary method - more robust)
    await api.setAmpModelById(0x7900); // British '70s

    // OR set amp model by name (convenience wrapper)
    await api.setAmpModel("British '70s");

    // Set individual knobs by name
    await api.setAmpKnob('Gain', 200);
    await api.setAmpKnob('Vol', 150);
    await api.setAmpKnob('Treb', 180);
    await api.setAmpKnob('Mid', 100);
    await api.setAmpKnob('Bass', 160);

    // Get current amp model
    const ampModel = api.getAmpModel();
    console.log('Current amp:', ampModel?.name);

    // Get current amp model ID
    const ampModelId = api.getAmpModelId();
    console.log('Current amp ID:', '0x' + ampModelId.toString(16));

    // Get specific knob value
    const gainValue = api.getAmpKnob('Gain');
    console.log('Gain:', gainValue);

    // Get all knobs as object
    const allKnobs = api.getAmpKnobs();
    console.log('All knobs:', allKnobs);

    // Get complete amp settings
    const ampSettings = api.getAmpSettings();
    console.log('Amp settings:', ampSettings);
}

// ==========================================
// EFFECT CONTROL
// ==========================================

async function effectControlExamples(api: MustangAPI) {
    // Set effects by ID (primary method - more robust)
    await api.setEffectById(0, 0x3c00); // Overdrive in stomp slot 1
    await api.setEffectById(1, 0x1a00); // Fuzz in stomp slot 2
    await api.setEffectById(4, 0x1200); // Sine Chorus in mod slot

    // OR set effects by name (convenience wrapper)
    await api.setEffect(5, 'Tape Delay'); // Delay slot
    await api.setEffect(7, 'Large Hall'); // Reverb slot

    // Set effect knobs by name
    await api.setEffectKnob(0, 'Level', 150);
    await api.setEffectKnob(0, 'Gain', 180);
    await api.setEffectKnob(4, 'Rate', 100);
    await api.setEffectKnob(4, 'Depth', 120);

    // Get effect model
    const effectModel = api.getEffectModel(0);
    console.log('Effect in slot 0:', effectModel?.name);

    // Get effect model ID
    const effectModelId = api.getEffectModelId(0);
    console.log('Effect ID:', '0x' + effectModelId.toString(16));

    // Get effect knobs
    const effectKnobs = api.getEffectKnobs(0);
    console.log('Effect knobs:', effectKnobs);

    // Get complete effect settings
    const effectSettings = api.getEffectSettings(0);
    console.log('Effect settings:', effectSettings);

    // Clear/remove an effect
    await api.clearEffect(1);

    // Toggle effect bypass
    await api.setEffectEnabled(0, false); // Bypass
    await api.setEffectEnabled(0, true);  // Enable
}

// ==========================================
// CABINET CONTROL
// ==========================================

async function cabinetControlExamples(api: MustangAPI) {
    // Set cabinet by ID (primary method - more robust)
    await api.setCabinetById(0x08); // 4x12 British '70s

    // OR set cabinet by name (convenience wrapper)
    await api.setCabinet("4x12 British '70s");

    // Get current cabinet
    const cabinet = api.getCabinet();
    console.log('Current cabinet:', cabinet?.name);

    // Get current cabinet ID
    const cabinetId = api.getCabinetId();
    console.log('Cabinet ID:', '0x' + cabinetId.toString(16));
}

// ==========================================
// PRESET MANAGEMENT
// ==========================================

async function presetManagementExamples(api: MustangAPI) {
    // Save current state to preset slot 5
    await api.savePreset(5, 'My Heavy Tone');

    // Load a preset
    await api.loadPreset(5);

    // Get all preset metadata (requires amp response)
    await api.getPresetList();

    // Access preset cache
    const preset = api.presets.get(5);
    console.log('Preset 5:', preset?.name);

    // Check current preset slot
    console.log('Current preset:', api.currentPresetSlot);
}

// ==========================================
// BUILDING A COMPLETE TONE
// ==========================================

async function buildCompleteTone(api: MustangAPI) {
    console.log('🎸 Building complete tone...');

    // 1. Set the amp
    await api.setAmpModel('Metal 2000');
    await api.setAmpKnob('Gain', 255);
    await api.setAmpKnob('Vol', 180);
    await api.setAmpKnob('Treb', 200);
    await api.setAmpKnob('Mid', 80);
    await api.setAmpKnob('Bass', 200);

    // 2. Set cabinet
    await api.setCabinet('4x12 Metal 2000');

    // 3. Add effects chain
    // Stomp 1: Overdrive for boost
    await api.setEffect(0, 'Overdrive');
    await api.setEffectKnob(0, 'Level', 200);
    await api.setEffectKnob(0, 'Gain', 100);

    // Mod: None (clear it)
    await api.clearEffect(4);

    // Delay: Stereo Tape Delay
    await api.setEffect(5, 'Stereo Tape Delay');
    await api.setEffectKnob(5, 'Level', 120);
    await api.setEffectKnob(5, 'Time', 150);
    await api.setEffectKnob(5, 'Fdbk', 80);

    // Reverb: Large Hall
    await api.setEffect(7, 'Large Hall');
    await api.setEffectKnob(7, 'Level', 100);
    await api.setEffectKnob(7, 'Decay', 150);

    // 4. Save it
    await api.savePreset(0, 'Metal Madness');

    console.log('✅ Tone built and saved!');
}

// ==========================================
// EXPLORING AVAILABLE MODELS
// ==========================================

function exploreModels() {
    console.log('=== AVAILABLE AMP MODELS ===');
    Object.values(AMP_MODELS).forEach(amp => {
        console.log(`${amp.name} (ID: 0x${amp.id.toString(16).padStart(4, '0')})`);
        console.log(`  Knobs: ${amp.knobs.filter(k => k).join(', ')}`);
    });

    console.log('\n=== AVAILABLE EFFECT MODELS ===');
    console.log('\nStomps:');
    Object.values(EFFECT_MODELS)
        .filter(e => e.type === 0x06)
        .forEach(effect => {
            console.log(`${effect.name}: ${effect.knobs.filter(k => k).join(', ')}`);
        });

    console.log('\nModulation:');
    Object.values(EFFECT_MODELS)
        .filter(e => e.type === 0x07)
        .forEach(effect => {
            console.log(`${effect.name}: ${effect.knobs.filter(k => k).join(', ')}`);
        });

    console.log('\nDelay:');
    Object.values(EFFECT_MODELS)
        .filter(e => e.type === 0x08)
        .forEach(effect => {
            console.log(`${effect.name}: ${effect.knobs.filter(k => k).join(', ')}`);
        });

    console.log('\nReverb:');
    Object.values(EFFECT_MODELS)
        .filter(e => e.type === 0x09)
        .forEach(effect => {
            console.log(`${effect.name}: ${effect.knobs.filter(k => k).join(', ')}`);
        });

    console.log('\n=== AVAILABLE CABINETS ===');
    CABINET_MODELS.forEach(cab => {
        console.log(`${cab.name} (ID: 0x${cab.id.toString(16).padStart(2, '0')})`);
    });
}

// ==========================================
// UI HELPER FUNCTIONS (STUBS)
// ==========================================

function updateAmpUI(model: string, knobs: Record<string, number>) {
    // Implement your UI update logic here
}

function updateEffectUI(slot: number, model: string, knobs: Record<string, number>) {
    // Implement your UI update logic here
}

function updateBypassIndicator(slot: number, enabled: boolean) {
    // Implement your UI update logic here
}

function updatePresetDisplay(slot: number, name: string) {
    // Implement your UI update logic here
}

function updateCabinetDisplay(cabinetName: string) {
    // Implement your UI update logic here
}

function refreshUI() {
    // Implement your full UI refresh logic here
}

// ==========================================
// COMPLETE EXAMPLE
// ==========================================

export async function completeExample() {
    const api = new MustangAPI();

    // Setup - Connect automatically starts monitoring and syncs state
    const connected = await api.connect();
    if (!connected) {
        console.error('Failed to connect');
        return;
    }

    // Setup event listeners
    setupEventListeners(api);

    // Build a tone
    await buildCompleteTone(api);

    // Explore available options
    exploreModels();

    // The app is now running and will react to:
    // - Physical knob changes on the amp
    // - Footswitch presses
    // - Preset changes from the amp
    // All via the event system!
}
