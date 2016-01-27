/* global sendSyncMessage */
/* global addMessageListener */
/* global Components */
/* global content */
/**
 * This file is part of Adguard Browser Extension (https://github.com/AdguardTeam/AdguardBrowserExtension).
 *
 * Adguard Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Adguard Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Adguard Browser Extension.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * This script is registered by "loadFrameScript" everywhere.
 * It decides whether we should load our content scripts to the loaded DOMWindow.
 */
var {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;
var Services = Cu.import("resource://gre/modules/Services.jsm", {}).Services;
var console = Cu.import('resource://gre/modules/devtools/Console.jsm', {}).console;

// Message names for send*Event methods
var CONTENT_TO_BACKGROUND_CHANNEL = 'adguard@content-background-channel';
var BACKGROUND_TO_CONTENT_CHANNEL = 'adguard@background-content-channel';

// JSON for localized strings (look at initI18n method)
var i18nMessages = Object.create(null);

// Used for sandbox creation
var nextSandboxId = 0;

/**
 * The DOMWindowCreated event is executed when a Window object has been created.
 */
var onDomWindowCreated = function() {
    
    if (!content.window || !content.document) {
        return;
    }
    
    var location = content.window.location;
    
    if (!location || !location.href) {
        return;
    }
    
    if (location.protocol == 'http:' || location.protocol == 'https:') {
        attachContentScripts(['content-script/preload.js']);
    } else if (location.protocol == 'chrome:') {
        // TODO: Handle
    }
};

/**
 * Fires when the frame script environment is shut down, i.e. when a tab gets closed.
 */
var onUnload = function() {
    // TODO: Remove listeners
};

/**
 * Creates sandbox object which will be a principal object for the content scripts.
 */
var createSandbox = function() {
    
    /**
     * A string value which identifies the sandbox in about:memory (and possibly other places in the future). 
     * 
     * This property is optional, but very useful for tracking memory usage of add-ons and other JavaScript compartments. 
     * A recommended value for this property is an absolute path to the script responsible for creating the sandbox. 
     * As of Gecko 13 (Firefox 13.0 / Thunderbird 13.0 / SeaMonkey 2.10), if you don't specify a sandbox name it 
     * will default to the caller's filename.
     */
    var sandboxName = '[' + (nextSandboxId++) + '] ' + content.window.location.href;
    console.log('Attach to ' + sandboxName); 
    
    // "content" is a DOM window here 
    // Creating "expanded" sandbox from it: https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Language_Bindings/Components.utils.Sandbox#Expanded_principal
    var sandbox = Cu.Sandbox([content.window], {
        sandboxName: sandboxName,
        sameZoneAs: content.window.top,
        sandboxPrototype: content.window,
        wantComponents: false,
        wantXHRConstructor: false
    });
    
    // Add to sandbox an object used for localization
    Services.scriptloader.loadSubScript('chrome://adguard/content/content-script/i18n-helper.js', sandbox);
    
    // You can't expose objects, only functions
    sandbox.portListen = function(name, listener) {
        console.log(new Date().toISOString() + 'portListen ' + name);
    };
    sandbox.portSend = function(name, message) {
        console.log(new Date().toISOString() + 'portSend ' + name);
    };
    Services.scriptloader.loadSubScript('chrome://adguard/content/content-script/content-script.js', sandbox);
    
        
    // sandbox.i18n = {
    //     getMessage: function (messageId, args) {
    //         var message = i18nMessages[messageId];
    //         if (!message) {
    //             throw 'Message ' + messageId + ' not found';
    //         }
    //         return sandbox.I18nHelper.replacePlaceholders(message, args);
    //     }
    // };
    
    // // Now add contentPage object
    // sandbox.contentPage = {

    //     listenerRegistered: false,
    //     callbacks: Object.create(null),
    //     callbackId: 0,

    //     sendMessage: function (message, callback) {
    //         console.log('Send a message from the content script');
    //     },

    //     onMessage: {
    //         listeners: null,
    //         addListener: function (listener) {
    //             if (!this.listeners) {
    //                 this.listeners = [];
    //             }

    //             this.listeners.push(listener);
    //         }
    //     }
    // };
    
    return sandbox;
};

/**
 * Attaches specified content scripts to the current DOM window.
 * 
 * @param array with scripts relative path
 */
var attachContentScripts = function(scripts) {
    var sandbox = createSandbox();
    
    for (var i = 0; i < scripts.length; i++) {
        var scriptPath = 'chrome://adguard/content/' + scripts[i];
        Services.scriptloader.loadSubScript(scriptPath, sandbox);
    }
};

/**
 * Initialize a JSON object with translations 
 */
var initI18n = function() {
    // Randomize URI to work around bug 719376
    var stringBundle = Services.strings.createBundle('chrome://adguard/locale/messages.properties?' + Math.random());    
    
    // MDN says getSimpleEnumeration returns nsIPropertyElement // https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIStringBundle#getSimpleEnumeration%28%29
    var props = stringBundle.getSimpleEnumeration();
    
    while (props.hasMoreElements()) {
        var prop = props.getNext();
        var propEl = prop.QueryInterface(Ci.nsIPropertyElement);
        
        var key = propEl.key;
        var str = propEl.value;

        i18nMessages[key] = str;
    }
};

/**
 * Entry point
 */
var initFrameScript = function() {
    
    // First of all, init translation
    initI18n();
    
    addEventListener('DOMWindowCreated', function() { 
        onDomWindowCreated();
    });

    addEventListener('unload', function() {
        onUnload();
    });
    
    if (content && content.window) {
        // This means the script was just loaded into existing window
        // Attach content scripts immediately
        onDomWindowCreated();
    }
};

initFrameScript();