'use strict';

// Load settings when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
});

// Load saved settings
function loadSettings() {
  chrome.storage.local.get('popoverShortcut', (result) => {
    const shortcut = result.popoverShortcut || '';
    document.getElementById('popoverShortcut').value = shortcut;
  });
}

// Setup event listeners
function setupEventListeners() {
  const shortcutInput = document.getElementById('popoverShortcut');
  const saveButton = document.getElementById('savePopoverShortcut');
  const clearButton = document.getElementById('clearPopoverShortcut');

  // Handle keyboard input for shortcut
  shortcutInput.addEventListener('keydown', handleShortcutKeydown);

  // Clear input on focus
  shortcutInput.addEventListener('focus', () => {
    shortcutInput.placeholder = 'Press keys...';
  });

  // Save shortcut
  saveButton.addEventListener('click', saveSettings);

  // Clear shortcut
  clearButton.addEventListener('click', clearShortcut);
}

// Handle keydown for shortcut input
function handleShortcutKeydown(event) {
  // Special handling for escape key to cancel
  if (event.key === 'Escape') {
    event.preventDefault();
    event.target.blur();
    return;
  }

  // Prevent default to avoid typing in the input
  event.preventDefault();

  // Skip if it's just a modifier key by itself
  if (event.key === 'Control' || event.key === 'Alt' ||
      event.key === 'Shift' || event.key === 'Meta') {
    return;
  }

  // Build the shortcut string
  const shortcutParts = [];
  if (event.altKey) {
    shortcutParts.push('Alt');
  }
  if (event.ctrlKey) {
    shortcutParts.push('Ctrl');
  }
  if (event.shiftKey) {
    shortcutParts.push('Shift');
  }
  if (event.metaKey) {
    shortcutParts.push('Meta');
  }

  // Need at least one modifier
  if (shortcutParts.length === 0) {
    return;
  }

  // Get the key itself
  let key = event.key;

  // Map special keys to their common names
  const keyMap = {
    ' ': 'Space',
    'ArrowUp': 'ArrowUp',
    'ArrowDown': 'ArrowDown',
    'ArrowLeft': 'ArrowLeft',
    'ArrowRight': 'ArrowRight',
    'Enter': 'Enter',
    'Tab': 'Tab',
    'Escape': 'Esc',
    'Delete': 'Delete',
    'Backspace': 'Backspace',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'PageUp',
    'PageDown': 'PageDown'
  };

  // For F1-F12 keys
  if (key.startsWith('F') && !isNaN(parseInt(key.substring(1)))) {
    // F1-F12 keys are fine as they are
  }
  // For letter keys, use uppercase
  else if (key.length === 1 && /[a-zA-Z]/.test(key)) {
    key = key.toUpperCase();
  }
  // For number keys, just use the number
  else if (key.length === 1 && /[0-9]/.test(key)) {
    key = key;
  }
  // For special keys, use the mapped name
  else if (keyMap[key]) {
    key = keyMap[key];
  }
  // For other keys, use a generic label
  else {
    key = 'Key';
  }

  shortcutParts.push(key);

  // Set the input value
  event.target.value = shortcutParts.join('+');
}

// Save settings
function saveSettings() {
  const shortcut = document.getElementById('popoverShortcut').value.trim();

  if (!shortcut) {
    showStatus('Please enter a shortcut key combination', 'error');
    return;
  }

  // Save to storage
  chrome.storage.local.set({ popoverShortcut: shortcut }, () => {
    showStatus('Shortcut saved successfully!', 'success');
  });
}

// Clear shortcut
function clearShortcut() {
  document.getElementById('popoverShortcut').value = '';
  chrome.storage.local.remove('popoverShortcut', () => {
    showStatus('Shortcut cleared', 'success');
  });
}

// Show status message
function showStatus(message, type) {
  const statusElement = document.getElementById('statusMessage');
  statusElement.textContent = message;
  statusElement.className = `status-message ${type}`;

  // Hide after 3 seconds
  setTimeout(() => {
    statusElement.className = 'status-message';
  }, 3000);
}

