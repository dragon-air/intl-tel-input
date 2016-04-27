/*
 * International Telephone Input v8.4.6
 * https://github.com/jackocnr/intl-tel-input.git
 * Licensed under the MIT license
 */
// wrap in UMD - see https://github.com/umdjs/umd/blob/master/jqueryPluginCommonjs.js
(function(factory) {
    if (typeof define === "function" && define.amd) {
        define([ "jquery" ], function($) {
            factory($, window, document);
        });
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory(require("jquery"), window, document);
    } else {
        factory(jQuery, window, document);
    }
})(function($, window, document, undefined) {
    "use strict";
    // these vars persist through all instances of the plugin
   //  var allCountries = [] ;
    var pluginName = "intlTelInput", id = 1, // give each instance it's own id for namespaced event handling
    defaults = {
        // whether or not to allow the dropdown
        allowDropdown: true,
        // if there is just a dial code in the input: remove it on blur, and re-add it on focus
        autoHideDialCode: true,
        // add or remove input placeholder with an example number for the selected country
        autoPlaceholder: false,
        // modify the auto placeholder
        customPlaceholder: null,
        // append menu to a specific element
        dropdownContainer: "",
        // don't display these countries
        excludeCountries: [],
        // format the input value during initialisation
        formatOnInit: true,
        // geoIp lookup function
        geoIpLookup: null,
        // initial country
        initialCountry: "",
        // don't insert international dial codes
        nationalMode: false,
        // number type to use for placeholders
        numberType: "MOBILE",
        // display only these countries
        onlyCountries: [],
        // the countries at the top of the list. defaults to united states and united kingdom
        preferredCountries: [  ],
        // display the country dial code next to the selected flag so it's not part of the typed number
        separateDialCode: false,
        // specify the path to the libphonenumber script to enable validation/formatting
        utilsScript: "",
        
        countryList:[] ,
        
    }, keys = {
        UP: 38,
        DOWN: 40,
        ENTER: 13,
        ESC: 27,
        PLUS: 43,
        A: 65,
        Z: 90,
        SPACE: 32,
        TAB: 9
    };
    // keep track of if the window.load event has fired as impossible to check after the fact
    $(window).load(function() {
        // UPDATE: use a public static field so we can fudge it in the tests
        $.fn[pluginName].windowLoaded = true;
    });
    function Plugin(element, options) {
        this.telInput = $(element);
        this.options = $.extend({}, defaults, options);
        // event namespace
        this.ns = "." + pluginName + id++;
        // Chrome, FF, Safari, IE9+
        this.isGoodBrowser = Boolean(element.setSelectionRange);
        this.hadInitialPlaceholder = Boolean($(element).attr("placeholder"));
    }
    Plugin.prototype = {
        _init: function() {
      /*      
        console.log(this.options.countryList);    
    for (var i = 0; i < this.options.countryList.length; i++) {
        var c = this.options.countryList[i];
        allCountries[i] = {
            name: c[0],
            iso2: c[1],
            dialCode: c[2],
            priority:  0,
            areaCodes: null
        };
    }
       console.log(allCountries);    */   
            // if in nationalMode, disable options relating to dial codes
            if (this.options.nationalMode) {
                this.options.autoHideDialCode = false;
            }
            // if separateDialCode then doesn't make sense to A) insert dial code into input (autoHideDialCode), and B) display national numbers (because we're displaying the country dial code next to them)
            if (this.options.separateDialCode) {
                this.options.autoHideDialCode = this.options.nationalMode = false;
                // let's force this for now for simplicity - we can support this later if need be
                this.options.allowDropdown = true;
            }
            // we cannot just test screen size as some smartphones/website meta tags will report desktop resolutions
            // Note: for some reason jasmine breaks if you put this in the main Plugin function with the rest of these declarations
            // Note: to target Android Mobiles (and not Tablets), we must find "Android" and "Mobile"
            this.isMobile = /Android.+Mobile|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (this.isMobile) {
                // trigger the mobile dropdown css
                $("body").addClass("iti-mobile");
                // on mobile, we want a full screen dropdown, so we must append it to the body
                if (!this.options.dropdownContainer) {
                    this.options.dropdownContainer = "body";
                }
            }
            // we return these deferred objects from the _init() call so they can be watched, and then we resolve them when each specific request returns
            // Note: again, jasmine breaks when I put these in the Plugin function
            this.autoCountryDeferred = new $.Deferred();
            this.utilsScriptDeferred = new $.Deferred();
            // process all the data: onlyCountries, excludeCountries, preferredCountries etc
            this._processCountryData();
            // generate the markup
            this._generateMarkup();
            // set the initial state of the input value and the selected flag
            this._setInitialState();
            // start all of the event listeners: autoHideDialCode, input keydown, selectedFlag click
            this._initListeners();
            // utils script, and auto country
            this._initRequests();
            // return the deferreds
            return [ this.autoCountryDeferred, this.utilsScriptDeferred ];
        },
        /********************
   *  PRIVATE METHODS
   ********************/
        // prepare all of the country data, including onlyCountries, excludeCountries and preferredCountries options
        _processCountryData: function() {
            // process onlyCountries or excludeCountries array if present
            this._processAllCountries();
            // process the countryCodes map
            this._processCountryCodes();
            // process the preferredCountries
            this._processPreferredCountries();
        },
        // add a country code to this.countryCodes
        _addCountryCode: function(iso2, dialCode, priority) {
            if (!(dialCode in this.countryCodes)) {
                this.countryCodes[dialCode] = [];
            }
            var index = priority || 0;
            this.countryCodes[dialCode][index] = iso2;
        },
        // filter the given countries using the process function
        _filterCountries: function(countryArray, processFunc) {
            var i;
            // standardise case
            for (i = 0; i < countryArray.length; i++) {
                countryArray[i] = countryArray[i].toLowerCase();
            }
            // build instance country array
            this.countries = [];
            for (i = 0; i < allCountries.length; i++) {
                if (processFunc($.inArray(allCountries[i].iso2, countryArray))) {
                    this.countries.push(allCountries[i]);
                }
            }
        },
        // process onlyCountries or excludeCountries array if present
        _processAllCountries: function() {
            if (this.options.onlyCountries.length) {
                // process onlyCountries option
                this._filterCountries(this.options.onlyCountries, function(inArray) {
                    // if country is in array
                   // console.log(this.options.onlyCountries);
                    return inArray != -1;
                });
            } else if (this.options.excludeCountries.length) {
                // process excludeCountries option
                this._filterCountries(this.options.excludeCountries, function(inArray) {
                    // if country is not in array
                    return inArray == -1;
                });
            } else {
                this.countries = allCountries;
            }
        },
        // process the countryCodes map
        _processCountryCodes: function() {
            this.countryCodes = {};
            for (var i = 0; i < this.countries.length; i++) {
                var c = this.countries[i];
                this._addCountryCode(c.iso2, c.dialCode, c.priority);
                // area codes
                if (c.areaCodes) {
                    for (var j = 0; j < c.areaCodes.length; j++) {
                        // full dial code is country code + dial code
                        this._addCountryCode(c.iso2, c.dialCode + c.areaCodes[j]);
                    }
                }
            }
        },
        // process preferred countries - iterate through the preferences, fetching the country data for each one
        _processPreferredCountries: function() {
            this.preferredCountries = [];
            for (var i = 0; i < this.options.preferredCountries.length; i++) {
                var countryCode = this.options.preferredCountries[i].toLowerCase(), countryData = this._getCountryData(countryCode, false, true);
                if (countryData) {
                    this.preferredCountries.push(countryData);
                }
            }
        },
        // generate all of the markup for the plugin: the selected flag overlay, and the dropdown
        _generateMarkup: function() {
            // prevent autocomplete as there's no safe, cross-browser event we can react to, so it can easily put the plugin in an inconsistent state e.g. the wrong flag selected for the autocompleted number, which on submit could mean the wrong number is saved (esp in nationalMode)
            this.telInput.attr("autocomplete", "off");
            // containers (mostly for positioning)
            var parentClass = "intl-tel-input";
            if (this.options.allowDropdown) {
                parentClass += " allow-dropdown";
            }
            if (this.options.separateDialCode) {
                parentClass += " separate-dial-code";
            }
            this.telInput.wrap($("<div>", {
                "class": parentClass
            }));
            this.flagsContainer = $("<div>", {
                "class": "flag-container"
            }).insertBefore(this.telInput);
            // currently selected flag (displayed to left of input)
            var selectedFlag = $("<div>", {
                "class": "selected-flag"
            });
            selectedFlag.appendTo(this.flagsContainer);
            this.selectedFlagInner = $("<div>", {
                "class": "iti-flag"
            }).appendTo(selectedFlag);
            if (this.options.separateDialCode) {
                this.selectedDialCode = $("<div>", {
                    "class": "selected-dial-code"
                }).appendTo(selectedFlag);
            }
            if (this.options.allowDropdown) {
                // make element focusable and tab naviagable
                selectedFlag.attr("tabindex", "0");
                // CSS triangle
                $("<div>", {
                    "class": "iti-arrow"
                }).appendTo(selectedFlag);
                // country dropdown: preferred countries, then divider, then all countries
                this.countryList = $("<ul>", {
                    "class": "country-list hide"
                });
                if (this.preferredCountries.length) {
                    this._appendListItems(this.preferredCountries, "preferred");
                    $("<li>", {
                        "class": "divider"
                    }).appendTo(this.countryList);
                }
                this._appendListItems(this.countries, "");
                // this is useful in lots of places
                this.countryListItems = this.countryList.children(".country");
                // create dropdownContainer markup
                if (this.options.dropdownContainer) {
                    this.dropdown = $("<div>", {
                        "class": "intl-tel-input iti-container"
                    }).append(this.countryList);
                } else {
                    this.countryList.appendTo(this.flagsContainer);
                }
            } else {
                // a little hack so we don't break anything
                this.countryListItems = $();
            }
        },
        // add a country <li> to the countryList <ul> container
        _appendListItems: function(countries, className) {
            // we create so many DOM elements, it is faster to build a temp string
            // and then add everything to the DOM in one go at the end
            var tmp = "";
            // for each country
            for (var i = 0; i < countries.length; i++) {
                var c = countries[i];
                // open the list item
                tmp += "<li class='country " + className + "' data-dial-code='" + c.dialCode + "' data-country-code='" + c.iso2 + "'>";
                // add the flag
                tmp += "<div class='flag-box'><div class='iti-flag " + c.iso2 + "'></div></div>";
                // and the country name and dial code
                tmp += "<span class='country-name'>" + c.name + "</span>";
                tmp += "<span class='dial-code'>+" + c.dialCode + "</span>";
                // close the list item
                tmp += "</li>";
            }
            this.countryList.append(tmp);
        },
        // set the initial state of the input value and the selected flag by:
        // 1. extracting a dial code from the given number
        // 2. using explicit initialCountry
        // 3. picking the first preferred country
        // 4. picking the first country
        _setInitialState: function() {
            var val = this.telInput.val();
            // if we already have a dial code we can go ahead and set the flag, else fall back to default
            if (this._getDialCode(val)) {
                this._updateFlagFromNumber(val, true);
            } else if (this.options.initialCountry !== "auto") {
                // see if we should select a flag
             //   console.log(this.options.initialCountry);
                if (this.options.initialCountry) {
                    this._setFlag(this.options.initialCountry, true);
                } else {
                    // no dial code and no initialCountry, so default to first in list
                    this.defaultCountry = this.preferredCountries.length ? this.preferredCountries[0].iso2 : this.countries[0].iso2;
                    if (!val) {
                        this._setFlag(this.defaultCountry, true);
                    }
                }
                // if empty and no nationalMode and no autoHideDialCode then insert the default dial code
                if (!val && !this.options.nationalMode && !this.options.autoHideDialCode && !this.options.separateDialCode) {
                    this.telInput.val("+" + this.selectedCountryData.dialCode);
                }
            }
            // NOTE: if initialCountry is set to auto, that will be handled separately
            // format
            if (val) {
                // this wont be run after _updateDialCode as that's only called if no val
                this._updateValFromNumber(val, this.options.formatOnInit);
            }
        },
        // initialise the main event listeners: input keyup, and click selected flag
        _initListeners: function() {
            this._initKeyListeners();
            if (this.options.autoHideDialCode) {
                this._initFocusListeners();
            }
            if (this.options.allowDropdown) {
                this._initDropdownListeners();
            }
        },
        // initialise the dropdown listeners
        _initDropdownListeners: function() {
            var that = this;
            // hack for input nested inside label: clicking the selected-flag to open the dropdown would then automatically trigger a 2nd click on the input which would close it again
            var label = this.telInput.closest("label");
            if (label.length) {
                label.on("click" + this.ns, function(e) {
                    // if the dropdown is closed, then focus the input, else ignore the click
                    if (that.countryList.hasClass("hide")) {
                        that.telInput.focus();
                    } else {
                        e.preventDefault();
                    }
                });
            }
            // toggle country dropdown on click
            var selectedFlag = this.selectedFlagInner.parent();
            selectedFlag.on("click" + this.ns, function(e) {
                // only intercept this event if we're opening the dropdown
                // else let it bubble up to the top ("click-off-to-close" listener)
                // we cannot just stopPropagation as it may be needed to close another instance
                if (that.countryList.hasClass("hide") && !that.telInput.prop("disabled") && !that.telInput.prop("readonly")) {
                    that._showDropdown();
                }
            });
            // open dropdown list if currently focused
            this.flagsContainer.on("keydown" + that.ns, function(e) {
                var isDropdownHidden = that.countryList.hasClass("hide");
                if (isDropdownHidden && (e.which == keys.UP || e.which == keys.DOWN || e.which == keys.SPACE || e.which == keys.ENTER)) {
                    // prevent form from being submitted if "ENTER" was pressed
                    e.preventDefault();
                    // prevent event from being handled again by document
                    e.stopPropagation();
                    that._showDropdown();
                }
                // allow navigation from dropdown to input on TAB
                if (e.which == keys.TAB) {
                    that._closeDropdown();
                }
            });
        },
        // init many requests: utils script / geo ip lookup
        _initRequests: function() {
            var that = this;
            // if the user has specified the path to the utils script, fetch it on window.load, else resolve
            if (this.options.utilsScript) {
                // if the plugin is being initialised after the window.load event has already been fired
                if ($.fn[pluginName].windowLoaded) {
                    $.fn[pluginName].loadUtils(this.options.utilsScript, this.utilsScriptDeferred);
                } else {
                    // wait until the load event so we don't block any other requests e.g. the flags image
                    $(window).load(function() {
                        $.fn[pluginName].loadUtils(that.options.utilsScript, that.utilsScriptDeferred);
                    });
                }
            } else {
                this.utilsScriptDeferred.resolve();
            }
            if (this.options.initialCountry === "auto") {
                this._loadAutoCountry();
            } else {
                this.autoCountryDeferred.resolve();
            }
        },
        // perform the geo ip lookup
        _loadAutoCountry: function() {
            var that = this;
            // check for cookie
            var cookieAutoCountry = window.Cookies ? Cookies.get("itiAutoCountry") : "";
            if (cookieAutoCountry) {
                $.fn[pluginName].autoCountry = cookieAutoCountry;
            }
            // 3 options:
            // 1) already loaded (we're done)
            // 2) not already started loading (start)
            // 3) already started loading (do nothing - just wait for loading callback to fire)
            if ($.fn[pluginName].autoCountry) {
                this.handleAutoCountry();
            } else if (!$.fn[pluginName].startedLoadingAutoCountry) {
                // don't do this twice!
                $.fn[pluginName].startedLoadingAutoCountry = true;
                if (typeof this.options.geoIpLookup === "function") {
                    this.options.geoIpLookup(function(countryCode) {
                        $.fn[pluginName].autoCountry = countryCode.toLowerCase();
                        if (window.Cookies) {
                            Cookies.set("itiAutoCountry", $.fn[pluginName].autoCountry, {
                                path: "/"
                            });
                        }
                        // tell all instances the auto country is ready
                        // TODO: this should just be the current instances
                        // UPDATE: use setTimeout in case their geoIpLookup function calls this callback straight away (e.g. if they have already done the geo ip lookup somewhere else). Using setTimeout means that the current thread of execution will finish before executing this, which allows the plugin to finish initialising.
                        setTimeout(function() {
                            $(".intl-tel-input input").intlTelInput("handleAutoCountry");
                        });
                    });
                }
            }
        },
        // initialize any key listeners
        _initKeyListeners: function() {
            var that = this;
            // update flag on keyup
            // (keep this listener separate otherwise the setTimeout breaks all the tests)
            this.telInput.on("keyup" + this.ns, function() {
                that._updateFlagFromNumber(that.telInput.val());
            });
            // update flag on cut/paste events (now supported in all major browsers)
            this.telInput.on("cut" + this.ns + " paste" + this.ns + " keyup" + this.ns, function() {
                // hack because "paste" event is fired before input is updated
                setTimeout(function() {
                    that._updateFlagFromNumber(that.telInput.val());
                });
            });
        },
        // adhere to the input's maxlength attr
        _cap: function(number) {
            var max = this.telInput.attr("maxlength");
            return max && number.length > max ? number.substr(0, max) : number;
        },
        // listen for mousedown, focus and blur
        _initFocusListeners: function() {
            var that = this;
            // mousedown decides where the cursor goes, so if we're focusing we must preventDefault as we'll be inserting the dial code, and we want the cursor to be at the end no matter where they click
            this.telInput.on("mousedown" + this.ns, function(e) {
                if (!that.telInput.is(":focus") && !that.telInput.val()) {
                    e.preventDefault();
                    // but this also cancels the focus, so we must trigger that manually
                    that.telInput.focus();
                }
            });
            // on focus: if empty, insert the dial code for the currently selected flag
            this.telInput.on("focus" + this.ns, function(e) {
                if (!that.telInput.val() && !that.telInput.prop("readonly") && that.selectedCountryData.dialCode) {
                    // insert the dial code
                    that.telInput.val("+" + that.selectedCountryData.dialCode);
                    // after auto-inserting a dial code, if the first key they hit is '+' then assume they are entering a new number, so remove the dial code. use keypress instead of keydown because keydown gets triggered for the shift key (required to hit the + key), and instead of keyup because that shows the new '+' before removing the old one
                    that.telInput.one("keypress.plus" + that.ns, function(e) {
                        if (e.which == keys.PLUS) {
                            that.telInput.val("");
                        }
                    });
                    // after tabbing in, make sure the cursor is at the end we must use setTimeout to get outside of the focus handler as it seems the selection happens after that
                    setTimeout(function() {
                        var input = that.telInput[0];
                        if (that.isGoodBrowser) {
                            var len = that.telInput.val().length;
                            input.setSelectionRange(len, len);
                        }
                    });
                }
            });
            // on blur: if just a dial code then remove it
            this.telInput.on("blur" + this.ns, function() {
                var value = that.telInput.val(), startsPlus = value.charAt(0) == "+";
                if (startsPlus) {
                    var numeric = that._getNumeric(value);
                    // if just a plus, or if just a dial code
                    if (!numeric || that.selectedCountryData.dialCode == numeric) {
                        that.telInput.val("");
                    }
                }
                // remove the keypress listener we added on focus
                that.telInput.off("keypress.plus" + that.ns);
            });
        },
        // extract the numeric digits from the given string
        _getNumeric: function(s) {
            return s.replace(/\D/g, "");
        },
        // show the dropdown
        _showDropdown: function() {
            this._setDropdownPosition();
            // update highlighting and scroll to active list item
            var activeListItem = this.countryList.children(".active");
            if (activeListItem.length) {
                this._highlightListItem(activeListItem);
                this._scrollTo(activeListItem);
            }
            // bind all the dropdown-related listeners: mouseover, click, click-off, keydown
            this._bindDropdownListeners();
            // update the arrow
            this.selectedFlagInner.children(".iti-arrow").addClass("up");
        },
        // decide where to position dropdown (depends on position within viewport, and scroll)
        _setDropdownPosition: function() {
            var that = this;
            if (this.options.dropdownContainer) {
                this.dropdown.appendTo(this.options.dropdownContainer);
            }
            // show the menu and grab the dropdown height
            this.dropdownHeight = this.countryList.removeClass("hide").outerHeight();
            if (!this.isMobile) {
                var pos = this.telInput.offset(), inputTop = pos.top, windowTop = $(window).scrollTop(), // dropdownFitsBelow = (dropdownBottom < windowBottom)
                dropdownFitsBelow = inputTop + this.telInput.outerHeight() + this.dropdownHeight < windowTop + $(window).height(), dropdownFitsAbove = inputTop - this.dropdownHeight > windowTop;
                // by default, the dropdown will be below the input. If we want to position it above the input, we add the dropup class.
                this.countryList.toggleClass("dropup", !dropdownFitsBelow && dropdownFitsAbove);
                // if dropdownContainer is enabled, calculate postion
                if (this.options.dropdownContainer) {
                    // by default the dropdown will be directly over the input because it's not in the flow. If we want to position it below, we need to add some extra top value.
                    var extraTop = !dropdownFitsBelow && dropdownFitsAbove ? 0 : this.telInput.innerHeight();
                    // calculate placement
                    this.dropdown.css({
                        top: inputTop + extraTop,
                        left: pos.left
                    });
                    // close menu on window scroll
                    $(window).on("scroll" + this.ns, function() {
                        that._closeDropdown();
                    });
                }
            }
        },
        // we only bind dropdown listeners when the dropdown is open
        _bindDropdownListeners: function() {
            var that = this;
            // when mouse over a list item, just highlight that one
            // we add the class "highlight", so if they hit "enter" we know which one to select
            this.countryList.on("mouseover" + this.ns, ".country", function(e) {
                that._highlightListItem($(this));
            });
            // listen for country selection
            this.countryList.on("click" + this.ns, ".country", function(e) {
                that._selectListItem($(this));
            });
            // click off to close
            // (except when this initial opening click is bubbling up)
            // we cannot just stopPropagation as it may be needed to close another instance
            var isOpening = true;
            $("html").on("click" + this.ns, function(e) {
                if (!isOpening) {
                    that._closeDropdown();
                }
                isOpening = false;
            });
            // listen for up/down scrolling, enter to select, or letters to jump to country name.
            // use keydown as keypress doesn't fire for non-char keys and we want to catch if they
            // just hit down and hold it to scroll down (no keyup event).
            // listen on the document because that's where key events are triggered if no input has focus
            var query = "", queryTimer = null;
            $(document).on("keydown" + this.ns, function(e) {
                // prevent down key from scrolling the whole page,
                // and enter key from submitting a form etc
                e.preventDefault();
                if (e.which == keys.UP || e.which == keys.DOWN) {
                    // up and down to navigate
                    that._handleUpDownKey(e.which);
                } else if (e.which == keys.ENTER) {
                    // enter to select
                    that._handleEnterKey();
                } else if (e.which == keys.ESC) {
                    // esc to close
                    that._closeDropdown();
                } else if (e.which >= keys.A && e.which <= keys.Z || e.which == keys.SPACE) {
                    // upper case letters (note: keyup/keydown only return upper case letters)
                    // jump to countries that start with the query string
                    if (queryTimer) {
                        clearTimeout(queryTimer);
                    }
                    query += String.fromCharCode(e.which);
                    that._searchForCountry(query);
                    // if the timer hits 1 second, reset the query
                    queryTimer = setTimeout(function() {
                        query = "";
                    }, 1e3);
                }
            });
        },
        // highlight the next/prev item in the list (and ensure it is visible)
        _handleUpDownKey: function(key) {
            var current = this.countryList.children(".highlight").first();
            var next = key == keys.UP ? current.prev() : current.next();
            if (next.length) {
                // skip the divider
                if (next.hasClass("divider")) {
                    next = key == keys.UP ? next.prev() : next.next();
                }
                this._highlightListItem(next);
                this._scrollTo(next);
            }
        },
        // select the currently highlighted item
        _handleEnterKey: function() {
            var currentCountry = this.countryList.children(".highlight").first();
            if (currentCountry.length) {
                this._selectListItem(currentCountry);
            }
        },
        // find the first list item whose name starts with the query string
        _searchForCountry: function(query) {
            for (var i = 0; i < this.countries.length; i++) {
                if (this._startsWith(this.countries[i].name, query)) {
                    var listItem = this.countryList.children("[data-country-code=" + this.countries[i].iso2 + "]").not(".preferred");
                    // update highlighting and scroll
                    this._highlightListItem(listItem);
                    this._scrollTo(listItem, true);
                    break;
                }
            }
        },
        // check if (uppercase) string a starts with string b
        _startsWith: function(a, b) {
            return a.substr(0, b.length).toUpperCase() == b;
        },
        // update the input's value to the given val (format first if possible)
        // NOTE: this is called from _setInitialState, handleUtils and setNumber
        _updateValFromNumber: function(number, doFormat, format) {
            if (doFormat && window.intlTelInputUtils && this.selectedCountryData) {
                if (!$.isNumeric(format)) {
                    format = this.options.nationalMode || number.charAt(0) != "+" ? intlTelInputUtils.numberFormat.NATIONAL : intlTelInputUtils.numberFormat.INTERNATIONAL;
                }
                number = intlTelInputUtils.formatNumber(number, this.selectedCountryData.iso2, format);
            }
            number = this._beforeSetNumber(number);
            this.telInput.val(number);
        },
        // check if need to select a new flag based on the given number
        // Note: called from _setInitialState, keyup handler, setNumber
        _updateFlagFromNumber: function(number, isInit) {
            // if we're in nationalMode and we already have US/Canada selected, make sure the number starts with a +1 so _getDialCode will be able to extract the area code
            // update: if we dont yet have selectedCountryData, but we're here (trying to update the flag from the number), that means we're initialising the plugin with a number that already has a dial code, so fine to ignore this bit
            if (number && this.options.nationalMode && this.selectedCountryData && this.selectedCountryData.dialCode == "1" && number.charAt(0) != "+") {
                if (number.charAt(0) != "1") {
                    number = "1" + number;
                }
                number = "+" + number;
            }
            // try and extract valid dial code from input
            var dialCode = this._getDialCode(number), countryCode = null;
            if (dialCode) {
                // check if one of the matching countries is already selected
                var countryCodes = this.countryCodes[this._getNumeric(dialCode)], alreadySelected = this.selectedCountryData && $.inArray(this.selectedCountryData.iso2, countryCodes) != -1;
                // if a matching country is not already selected (or this is an unknown NANP area code): choose the first in the list
                if (!alreadySelected || this._isUnknownNanp(number, dialCode)) {
                    // if using onlyCountries option, countryCodes[0] may be empty, so we must find the first non-empty index
                    for (var j = 0; j < countryCodes.length; j++) {
                        if (countryCodes[j]) {
                            countryCode = countryCodes[j];
                            break;
                        }
                    }
                }
            } else if (number.charAt(0) == "+" && this._getNumeric(number).length) {
                // invalid dial code, so empty
                // Note: use getNumeric here because the number has not been formatted yet, so could contain bad chars
                countryCode = "";
            } else if (!number || number == "+") {
                // empty, or just a plus, so default
                countryCode = this.defaultCountry;
            }
            if (countryCode !== null) {
                this._setFlag(countryCode, isInit);
            }
        },
        // check if the given number contains an unknown area code from the North American Numbering Plan i.e. the only dialCode that could be extracted was +1 (instead of say +1 702) and the actual number's length is >=4
        _isUnknownNanp: function(number, dialCode) {
            return dialCode == "+1" && this._getNumeric(number).length >= 4;
        },
        // remove highlighting from other list items and highlight the given item
        _highlightListItem: function(listItem) {
            this.countryListItems.removeClass("highlight");
            listItem.addClass("highlight");
        },
        // find the country data for the given country code
        // the ignoreOnlyCountriesOption is only used during init() while parsing the onlyCountries array
        _getCountryData: function(countryCode, ignoreOnlyCountriesOption, allowFail) {
            var countryList = ignoreOnlyCountriesOption ? allCountries : this.countries;
            for (var i = 0; i < countryList.length; i++) {
                if (countryList[i].iso2 == countryCode) {
                    return countryList[i];
                }
            }
            if (allowFail) {
                return null;
            } else {
                throw new Error("No country data for '" + countryCode + "'");
            }
        },
        // select the given flag, update the placeholder and the active list item
        // Note: called from _setInitialState, _updateFlagFromNumber, _selectListItem, setCountry
        _setFlag: function(countryCode, isInit) {
            var prevCountry = this.selectedCountryData && this.selectedCountryData.iso2 ? this.selectedCountryData : {};
            // do this first as it will throw an error and stop if countryCode is invalid
            this.selectedCountryData = countryCode ? this._getCountryData(countryCode, false, false) : {};
            // update the defaultCountry - we only need the iso2 from now on, so just store that
            if (this.selectedCountryData.iso2) {
                this.defaultCountry = this.selectedCountryData.iso2;
            }
            this.selectedFlagInner.attr("class", "iti-flag " + countryCode);
            // update the selected country's title attribute
            var title = countryCode ? this.selectedCountryData.name + ": +" + this.selectedCountryData.dialCode : "Unknown";
            this.selectedFlagInner.parent().attr("title", title);
            if (this.options.separateDialCode) {
                var dialCode = this.selectedCountryData.dialCode ? "+" + this.selectedCountryData.dialCode : "", parent = this.telInput.parent();
                if (prevCountry.dialCode) {
                    parent.removeClass("iti-sdc-" + (prevCountry.dialCode.length + 1));
                }
                if (dialCode) {
                    parent.addClass("iti-sdc-" + dialCode.length);
                }
                this.selectedDialCode.text(dialCode);
            }
            // and the input's placeholder
            this._updatePlaceholder();
            // update the active list item
            this.countryListItems.removeClass("active");
            if (countryCode) {
                this.countryListItems.find(".iti-flag." + countryCode).first().closest(".country").addClass("active");
            }
            // on change flag, trigger a custom event
            if (!isInit && prevCountry.iso2 !== countryCode) {
                this.telInput.trigger("countrychange", this.selectedCountryData);
            }
        },
        // update the input placeholder to an example number from the currently selected country
        _updatePlaceholder: function() {
            if (window.intlTelInputUtils && !this.hadInitialPlaceholder && this.options.autoPlaceholder && this.selectedCountryData) {
                var numberType = intlTelInputUtils.numberType[this.options.numberType], placeholder = this.selectedCountryData.iso2 ? intlTelInputUtils.getExampleNumber(this.selectedCountryData.iso2, this.options.nationalMode, numberType) : "";
                placeholder = this._beforeSetNumber(placeholder);
                if (typeof this.options.customPlaceholder === "function") {
                    placeholder = this.options.customPlaceholder(placeholder, this.selectedCountryData);
                }
                this.telInput.attr("placeholder", placeholder);
            }
        },
        // called when the user selects a list item from the dropdown
        _selectListItem: function(listItem) {
            // update selected flag and active list item
            this._setFlag(listItem.attr("data-country-code"));
            this._closeDropdown();
            this._updateDialCode(listItem.attr("data-dial-code"), true);
            // focus the input
            this.telInput.focus();
            // fix for FF and IE11 (with nationalMode=false i.e. auto inserting dial code), who try to put the cursor at the beginning the first time
            if (this.isGoodBrowser) {
                var len = this.telInput.val().length;
                this.telInput[0].setSelectionRange(len, len);
            }
        },
        // close the dropdown and unbind any listeners
        _closeDropdown: function() {
            this.countryList.addClass("hide");
            // update the arrow
            this.selectedFlagInner.children(".iti-arrow").removeClass("up");
            // unbind key events
            $(document).off(this.ns);
            // unbind click-off-to-close
            $("html").off(this.ns);
            // unbind hover and click listeners
            this.countryList.off(this.ns);
            // remove menu from container
            if (this.options.dropdownContainer) {
                if (!this.isMobile) {
                    $(window).off("scroll" + this.ns);
                }
                this.dropdown.detach();
            }
        },
        // check if an element is visible within it's container, else scroll until it is
        _scrollTo: function(element, middle) {
            var container = this.countryList, containerHeight = container.height(), containerTop = container.offset().top, containerBottom = containerTop + containerHeight, elementHeight = element.outerHeight(), elementTop = element.offset().top, elementBottom = elementTop + elementHeight, newScrollTop = elementTop - containerTop + container.scrollTop(), middleOffset = containerHeight / 2 - elementHeight / 2;
            if (elementTop < containerTop) {
                // scroll up
                if (middle) {
                    newScrollTop -= middleOffset;
                }
                container.scrollTop(newScrollTop);
            } else if (elementBottom > containerBottom) {
                // scroll down
                if (middle) {
                    newScrollTop += middleOffset;
                }
                var heightDifference = containerHeight - elementHeight;
                container.scrollTop(newScrollTop - heightDifference);
            }
        },
        // replace any existing dial code with the new one
        // Note: called from _selectListItem and setCountry
        _updateDialCode: function(newDialCode, hasSelectedListItem) {
            var inputVal = this.telInput.val(), newNumber;
            // save having to pass this every time
            newDialCode = "+" + newDialCode;
            if (inputVal.charAt(0) == "+") {
                // there's a plus so we're dealing with a replacement (doesn't matter if nationalMode or not)
                var prevDialCode = this._getDialCode(inputVal);
                if (prevDialCode) {
                    // current number contains a valid dial code, so replace it
                    newNumber = inputVal.replace(prevDialCode, newDialCode);
                } else {
                    // current number contains an invalid dial code, so ditch it
                    // (no way to determine where the invalid dial code ends and the rest of the number begins)
                    newNumber = newDialCode;
                }
            } else if (this.options.nationalMode || this.options.separateDialCode) {
                // don't do anything
                return;
            } else {
                // nationalMode is disabled
                if (inputVal) {
                    // there is an existing value with no dial code: prefix the new dial code
                    newNumber = newDialCode + inputVal;
                } else if (hasSelectedListItem || !this.options.autoHideDialCode) {
                    // no existing value and either they've just selected a list item, or autoHideDialCode is disabled: insert new dial code
                    newNumber = newDialCode;
                } else {
                    return;
                }
            }
            this.telInput.val(newNumber);
        },
        // try and extract a valid international dial code from a full telephone number
        // Note: returns the raw string inc plus character and any whitespace/dots etc
        _getDialCode: function(number) {
            var dialCode = "";
            // only interested in international numbers (starting with a plus)
            if (number.charAt(0) == "+") {
                var numericChars = "";
                // iterate over chars
                for (var i = 0; i < number.length; i++) {
                    var c = number.charAt(i);
                    // if char is number
                    if ($.isNumeric(c)) {
                        numericChars += c;
                        // if current numericChars make a valid dial code
                        if (this.countryCodes[numericChars]) {
                            // store the actual raw string (useful for matching later)
                            dialCode = number.substr(0, i + 1);
                        }
                        // longest dial code is 4 chars
                        if (numericChars.length == 4) {
                            break;
                        }
                    }
                }
            }
            return dialCode;
        },
        // get the input val, adding the dial code if separateDialCode is enabled
        _getFullNumber: function() {
            var prefix = this.options.separateDialCode ? "+" + this.selectedCountryData.dialCode : "";
            return prefix + this.telInput.val();
        },
        // remove the dial code if separateDialCode is enabled
        _beforeSetNumber: function(number) {
            if (this.options.separateDialCode) {
                var dialCode = this._getDialCode(number);
                if (dialCode) {
                    // _getDialCode returns area code as well, but we just want the dial code
                    dialCode = "+" + this.selectedCountryData.dialCode;
                    // a lot of numbers will have a space separating the dial code and the main number, and some NANP numbers will have a hyphen e.g. +1 684-733-1234 - in both cases we want to get rid of it
                    // NOTE: don't just trim all non-numerics as may want to preserve an open parenthesis etc
                    var start = number[dialCode.length] === " " || number[dialCode.length] === "-" ? dialCode.length + 1 : dialCode.length;
                    number = number.substr(start);
                }
            }
            return this._cap(number);
        },
        /********************
   *  PUBLIC METHODS
   ********************/
        // this is called when the geoip call returns
        handleAutoCountry: function() {
            if (this.options.initialCountry === "auto") {
                // we must set this even if there is an initial val in the input: in case the initial val is invalid and they delete it - they should see their auto country
                this.defaultCountry = $.fn[pluginName].autoCountry;
                // if there's no initial value in the input, then update the flag
                if (!this.telInput.val()) {
                    this.setCountry(this.defaultCountry);
                }
                this.autoCountryDeferred.resolve();
            }
        },
        // remove plugin
        destroy: function() {
            if (this.allowDropdown) {
                // make sure the dropdown is closed (and unbind listeners)
                this._closeDropdown();
                // click event to open dropdown
                this.selectedFlagInner.parent().off(this.ns);
                // label click hack
                this.telInput.closest("label").off(this.ns);
            }
            // unbind all events: key events, and focus/blur events if autoHideDialCode=true
            this.telInput.off(this.ns);
            // remove markup (but leave the original input)
            var container = this.telInput.parent();
            container.before(this.telInput).remove();
        },
        // get the extension from the current number
        getExtension: function() {
            if (window.intlTelInputUtils) {
                return intlTelInputUtils.getExtension(this._getFullNumber(), this.selectedCountryData.iso2);
            }
            return "";
        },
        // format the number to the given format
        getNumber: function(format) {
            if (window.intlTelInputUtils) {
                return intlTelInputUtils.formatNumber(this._getFullNumber(), this.selectedCountryData.iso2, format);
            }
            return "";
        },
        // get the type of the entered number e.g. landline/mobile
        getNumberType: function() {
            if (window.intlTelInputUtils) {
                return intlTelInputUtils.getNumberType(this._getFullNumber(), this.selectedCountryData.iso2);
            }
            return -99;
        },
        // get the country data for the currently selected flag
        getSelectedCountryData: function() {
            // if this is undefined, the plugin will return it's instance instead, so in that case an empty object makes more sense
            return this.selectedCountryData || {};
        },
        // get the validation error
        getValidationError: function() {
            if (window.intlTelInputUtils) {
                return intlTelInputUtils.getValidationError(this._getFullNumber(), this.selectedCountryData.iso2);
            }
            return -99;
        },
        // validate the input val - assumes the global function isValidNumber (from utilsScript)
        isValidNumber: function() {
            var val = $.trim(this._getFullNumber()), countryCode = this.options.nationalMode ? this.selectedCountryData.iso2 : "";
            return window.intlTelInputUtils ? intlTelInputUtils.isValidNumber(val, countryCode) : null;
        },
        // update the selected flag, and update the input val accordingly
        setCountry: function(countryCode) {
            countryCode = countryCode.toLowerCase();
            // check if already selected
            if (!this.selectedFlagInner.hasClass(countryCode)) {
                this._setFlag(countryCode);
                this._updateDialCode(this.selectedCountryData.dialCode, false);
            }
        },
        // set the input value and update the flag
        // NOTE: format arg is for public method: to allow devs to format how they want
        setNumber: function(number, format) {
            // we must update the flag first, which updates this.selectedCountryData, which is used for formatting the number before displaying it
            this._updateFlagFromNumber(number);
            this._updateValFromNumber(number, $.isNumeric(format), format);
        },
        // this is called when the utils request completes
        handleUtils: function() {
            // if the request was successful
            if (window.intlTelInputUtils) {
                // if there's an initial value in the input, then format it
                if (this.telInput.val()) {
                    this._updateValFromNumber(this.telInput.val(), this.options.formatOnInit);
                }
                this._updatePlaceholder();
            }
            this.utilsScriptDeferred.resolve();
        }
    };
    // using https://github.com/jquery-boilerplate/jquery-boilerplate/wiki/Extending-jQuery-Boilerplate
    // (adapted to allow public functions)
    $.fn[pluginName] = function(options) {
        var args = arguments;
        // Is the first parameter an object (options), or was omitted,
        // instantiate a new instance of the plugin.
        if (options === undefined || typeof options === "object") {
            // collect all of the deferred objects for all instances created with this selector
            var deferreds = [];
            this.each(function() {
                if (!$.data(this, "plugin_" + pluginName)) {
                    var instance = new Plugin(this, options);
                    var instanceDeferreds = instance._init();
                    // we now have 2 deffereds: 1 for auto country, 1 for utils script
                    deferreds.push(instanceDeferreds[0]);
                    deferreds.push(instanceDeferreds[1]);
                    $.data(this, "plugin_" + pluginName, instance);
                }
            });
            // return the promise from the "master" deferred object that tracks all the others
            return $.when.apply(null, deferreds);
        } else if (typeof options === "string" && options[0] !== "_") {
            // If the first parameter is a string and it doesn't start
            // with an underscore or "contains" the `init`-function,
            // treat this as a call to a public method.
            // Cache the method call to make it possible to return a value
            var returns;
            this.each(function() {
                var instance = $.data(this, "plugin_" + pluginName);
                // Tests that there's already a plugin-instance
                // and checks that the requested public method exists
                if (instance instanceof Plugin && typeof instance[options] === "function") {
                    // Call the method of our plugin instance,
                    // and pass it the supplied arguments.
                    returns = instance[options].apply(instance, Array.prototype.slice.call(args, 1));
                }
                // Allow instances to be destroyed via the 'destroy' method
                if (options === "destroy") {
                    $.data(this, "plugin_" + pluginName, null);
                }
            });
            // If the earlier cached method gives a value back return the value,
            // otherwise return this to preserve chainability.
            return returns !== undefined ? returns : this;
        }
    };
    /********************
 *  STATIC METHODS
 ********************/
    // get the country data object
    $.fn[pluginName].getCountryData = function() {
        return allCountries;
    };
    // load the utils script
    $.fn[pluginName].loadUtils = function(path, utilsScriptDeferred) {
        if (!$.fn[pluginName].loadedUtilsScript) {
            // don't do this twice! (dont just check if window.intlTelInputUtils exists as if init plugin multiple times in quick succession, it may not have finished loading yet)
            $.fn[pluginName].loadedUtilsScript = true;
            // dont use $.getScript as it prevents caching
            $.ajax({
                url: path,
                complete: function() {
                    // tell all instances that the utils request is complete
                    $(".intl-tel-input input").intlTelInput("handleUtils");
                },
                dataType: "script",
                cache: true
            });
        } else if (utilsScriptDeferred) {
            utilsScriptDeferred.resolve();
        }
    };
    // version
    $.fn[pluginName].version = "8.4.6";
    // Tell JSHint to ignore this warning: "character may get silently deleted by one or more browsers"
    // jshint -W100
    // Array of country objects for the flag dropdown.
    // Each contains a name, country code (ISO 3166-1 alpha-2) and dial code.
    // Originally from https://github.com/mledoze/countries
    // then with a couple of manual re-arrangements to be alphabetical
    // then changed Kazakhstan from +76 to +7
    // and Vatican City from +379 to +39 (see issue 50)
    // and Caribean Netherlands from +5997 to +599
    // and Curacao from +5999 to +599
    // Removed:  Kosovo, Pitcairn Islands, South Georgia
    // UPDATE Sept 12th 2015
    // List of regions that have iso2 country codes, which I have chosen to omit:
    // (based on this information: https://en.wikipedia.org/wiki/List_of_country_calling_codes)
    // AQ - Antarctica - all different country codes depending on which "base"
    // BV - Bouvet Island - no calling code
    // GS - South Georgia and the South Sandwich Islands - "inhospitable collection of islands" - same flag and calling code as Falkland Islands
    // HM - Heard Island and McDonald Islands - no calling code
    // PN - Pitcairn - tiny population (56), same calling code as New Zealand
    // TF - French Southern Territories - no calling code
    // UM - United States Minor Outlying Islands - no calling code
    // UPDATE the criteria of supported countries or territories (see issue 297)
    // Have an iso2 code: https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2
    // Have a country calling code: https://en.wikipedia.org/wiki/List_of_country_calling_codes
    // Have a flag
    // Must be supported by libphonenumber: https://github.com/googlei18n/libphonenumber
    // Update: converted objects to arrays to save bytes!
    // Update: added "priority" for countries with the same dialCode as others
    // Update: added array of area codes for countries with the same dialCode as others
    // So each country array has the following information:
    // [
    //    Country name,
    //    iso2 code,
    //    International dial code,
    //    Order (if >1 country with same dial code),
    //    Area codes (if >1 country with same dial code)
    // ]
    
    
     var allCountries = [     [
        "country-name-AF_18341",
        "Afghanistan",
        "af",
        "93"
    ],
    [
        "country-name-AL_18091",
        "Albania",
        "al",
        "355"
    ],
    [
        "country-name-DZ_18092",
        "Algeria",
        "dz",
        "213"
    ],
    [
        "country-name-AS_18093",
        "American Samoa",
        "as",
        "1684"
    ],
    [
        "country-name-AD_18094",
        "Andorra",
        "ad",
        "376"
    ],
    [
        "country-name-AO_18095",
        "Angola",
        "ao",
        "244"
    ],
    [
        "country-name-AI_18096",
        "Anguilla",
        "ai",
        "1264"
    ],
    [
        "country-name-AQ_18097",
        "Antarctica",
        "aq",
        "672"
    ],
    [
        "country-name-AG_18098",
        "Antigua And Barbuda",
        "ag",
        "1268"
    ],
    [
        "country-name-AR_18099",
        "Argentina",
        "ar",
        "54"
    ],
    [
        "country-name-AM_18100",
        "Armenia",
        "am",
        "374"
    ],
    [
        "country-name-AW_18101",
        "Aruba",
        "aw",
        "297"
    ],
    [
        "country-name-AU_18102",
        "Australia",
        "au",
        "61"
    ],
    [
        "country-name-AT_18103",
        "Austria",
        "at",
        "43"
    ],
    [
        "country-name-AZ_18104",
        "Azerbaijan",
        "az",
        "994"
    ],
    [
        "country-name-BS_18105",
        "Bahamas",
        "bs",
        "1242"
    ],
    [
        "country-name-BH_18106",
        "Bahrain",
        "bh",
        "973"
    ],
    [
        "country-name-BD_18107",
        "Bangladesh",
        "bd",
        "880"
    ],
    [
        "country-name-BB_18108",
        "Barbados",
        "bb",
        "1246"
    ],
    [
        "country-name-BY_18109",
        "Belarus",
        "by",
        "375"
    ],
    [
        "country-name-BE_18110",
        "Belgium",
        "be",
        "32"
    ],
    [
        "country-name-BZ_18111",
        "Belize",
        "bz",
        "501"
    ],
    [
        "country-name-BJ_18112",
        "Benin",
        "bj",
        "229"
    ],
    [
        "country-name-BM_18113",
        "Bermuda",
        "bm",
        "1441"
    ],

    [
        "country-name-BO_18115",
        "Bolivia",
        "bo",
        "591"
    ],
    [
        "country-name-BA_18116",
        "Bosnia and Herzegovina",
        "ba",
        "387"
    ],
    [
        "country-name-BW_18117",
        "Botswana",
        "bw",
        "267"
    ],
    [
        "country-name-BR_18119",
        "Brazil",
        "br",
        "55"
    ],
     [
        "country-name-VG_18324",
        "British Indian Ocean Territory",
        "io",
        "246"
    ],
    [
        "country-name-BN_18121",
        "Brunei",
        "bn",
        "673"
    ],
    [
        "country-name-BG_18122",
        "Bulgaria",
        "bg",
        "359"
    ],
    [
        "country-name-BF_18123",
        "Burkina Faso",
        "bf",
        "226"
    ],
    [
        "country-name-BI_18125",
        "Burundi",
        "bi",
        "257"
    ],
    [
        "country-name-KH_18126",
        "Cambodia",
        "kh",
        "855"
    ],
    [
        "country-name-CM_18127",
        "Cameroon",
        "cm",
        "237"
    ],
    [
        "country-name-CA_18128",
        "Canada",
        "ca",
        "1"
    ],
    [
        "country-name-CV_18129",
        "Cape Verde",
        "cv",
        "238"
    ],
    [
        "country-name-KY_18130",
        "Cayman Islands",
        "ky",
        "1345"
    ],
    [
        "country-name-CF_18131",
        "Central African Republic",
        "cf",
        "236"
    ],
    [
        "country-name-TD_18132",
        "Chad",
        "td",
        "235"
    ],
    [
        "country-name-CL_18133",
        "Chile",
        "cl",
        "56"
    ],
    [
        "country-name-CN_18134",
        "China",
        "cn",
        "86"
    ],
    [
        "country-name-CX_18135",
        "Christmas Island",
        "cxr",
        "61"
    ],
    [
        "country-name-CC_18136",
        "Cocos (Keeling) Islands",
        "cc",
        "61"
    ],
    [
        "country-name-CO_18137",
        "Colombia",
        "co",
        "57"
    ],
    [
        "country-name-KM_18138",
        "Comoros",
        "km",
        "269"
    ],
    [
         "country-name-CG_18268",
         "congo",
         "CG",
         "242"
    ],
   [
         "country-name-CD_18140",
         "congo",
         "cd",
         "243"
    ],
    [
        "country-name-CK_18141",
        "Cook Islands",
        "ck",
        "682"
    ],
    [
        "country-name-CR_18142",
        "Costa Rica",
        "cr",
        "506"
    ],
 [
        "country-name-CI_18143",
        "Cote d'Ivoire",
        "ci",
        "225"
    ],
    [
        "country-name-CY_18145",
        "Cyprus",
        "cy",
        "357"
    ],

    [
        "country-name-CZ_18146",
        "Czech Republic",
        "cz",
        "420"
    ],
 [
        "country-name-DK_18147",
        "Denmark",
        "dk",
        "45"
    ],
    [
        "country-name-DJ_18148",
        "Djibouti",
        "dj",
        "253"
    ],


    [
        "country-name-DM_18149",
        "Dominica",
        "dm",
        "1767"
    ],
    [
        "country-name-DO_18150",
        "Dominican Republic (RepÃƒÂºblica Dominicana)",
        "do",
        "1",
        2,
        [
            "809",
            "829",
            "849"
        ]
    ],
    
   [
        "country-name-EC_18152",
        "Ecuador",
        "ec",
        "593"
    ],

   
    [
        "country-name-EG_18153",
        "Egypt",
        "eg",
        "20"
    ],
    [
        "country-name-SV_18154",
        "El Salvador",
        "sv",
        "503"
    ],
    [
        "country-name-GQ_18156",
        "Equatorial Guinea",
        "gq",
        "240"
    ],
    [
        "country-name-ER_18157",
        "Eritrea",
        "er",
        "291"
    ],
    [
        "country-name-EE_18159",
        "Estonia",
        "ee",
        "372"
    ],
    [
        "country-name-ET_18160",
        "Ethiopia",
        "et",
        "251"
    ],
    [
        "country-name-FK_18161",
        "Falkland Islands",
        "fk",
        "500"
    ],
    [
        "country-name-FO_18162",
        "Faroe Islands",
        "fo",
        "298"
    ],
    [
        "country-name-FJ_18163",
        "Fiji",
        "fj",
        "679"
    ],
    [
        "country-name-FI_18164",
        "Finland",
        "fi",
        "358"
    ],
    [
        "country-name-FR_18165",
        "France",
        "fr",
        "33"
    ],
    [
        "country-name-GF_18166",
        "French Guiana",
        "gf",
        "594"
    ],
    [
        "country-name-PF_18167",
        "French Polynesia",
        "pf",
        "689"
    ],
    [
        "country-name-GA_18169",
        "Gabon",
        "ga",
        "241"
    ],
    [
        "country-name-GM_18170",
        "Gambia",
        "gm",
        "220"
    ],
    [
        "country-name-GE_18171",
        "Georgia",
        "ge",
        "995"
    ],
    [
        "country-name-DE_18172",
        "Germany",
        "de",
        "49"
    ],
    [
        "country-name-GH_18173",
        "Ghana",
        "gh",
        "233"
    ],
    [
        "country-name-GI_18174",
        "Gibraltar",
        "gi",
        "350"
    ],
    [
        "country-name-GR_18176",
        "Greece",
        "gr",
        "30"
    ],
    [
        "country-name-GL_18177",
        "Greenland",
        "gl",
        "299"
    ],
    [
        "country-name-GD_18178",
        "Grenada",
        "gd",
        "1473"
    ],
    [
        "country-name-GP_18179",
        "Guadeloupe",
        "gp",
        "590",
        0
    ],
 
    [
        "country-name-GN_18182",
        "Guinea",
        "gn",
        "224"
    ],
   
    [
        "country-name-HK_18188",
        "Hong Kong",
        "hk",
        "852"
    ],
    [
        "country-name-HU_18189",
        "Hungary",
        "hu",
        "36"
    ],
    [
        "country-name-IS_18190",
        "Iceland",
        "is",
        "354"
    ],
    [
        "country-name-IN_18191",
        "India",
        "in",
        "91"
    ],
  
    [
        "country-name-IL_18194",
        "Israel",
        "il",
        "972"
    ],
    [
        "country-name-IT_18195",
        "Italy",
        "it",
        "39",
        0
    ],
   
    [
        "country-name-JM_18196",
        "Jamaica",
        "jm",
        "1876"
    ],
    [
        "country-name-JP_18197",
        "Japan",
        "jp",
        "81"
    ],

    [
        "country-name-JO_18198",
        "Jordan",
        "jo",
        "962"
    ],
    [
        "country-name-KZ_18199",
        "Kazakhstan",
        "kz",
        "7",
        1
    ],
    [
        "country-name-KE_18200",
        "Kenya",
        "ke",
        "254"
    ],
    [
        "country-name-KI_18201",
        "Kiribati",
        "ki",
        "686"
    ],

    [
        "country-name-KW_18204",
        "Kuwait",
        "kw",
        "965"
    ],
    [
        "country-name-KG_18205",
        "Kyrgyzstan",
        "kg",
        "996"
    ],
    [
        "country-name-LA_18206",
        "Laos",
        "la",
        "856"
    ],
    [
        "country-name-LV_18207",
        "Latvia",
        "lv",
        "371"
    ],
    [
        "country-name-LB_18208",
        "Lebanon",
        "lb",
        "961"
    ],
    [
        "country-name-LS_18209",
        "Lesotho",
        "ls",
        "266"
    ],
    [
        "country-name-LR_18210",
        "Liberia",
        "lr",
        "231"
    ],
 
    [
        "country-name-LI_18211",
        "Liechtenstein",
        "li",
        "423"
    ],
    [
        "country-name-LT_18212",
        "Lithuania",
        "lt",
        "370"
    ],
    [
        "country-name-LU_18213",
        "Luxembourg",
        "lu",
        "352"
    ],
    [
        "country-name-MO_18214",
        "Macau",
        "mo",
        "853"
    ],
    [
        "country-name-MK_18215",
        "Macedonia",
        "mk",
        "389"
    ],
    [
        "country-name-MG_18216",
        "Madagascar",
        "mg",
        "261"
    ],
    [
        "country-name-MW_18217",
        "Malawi",
        "mw",
        "265"
    ],
    [
        "country-name-MY_18218",
        "Malaysia",
        "my",
        "60"
    ],
    [
        "country-name-MV_18219",
        "Maldives",
        "mv",
        "960"
    ],
    [
        "country-name-ML_18220",
        "Mali",
        "ml",
        "223"
    ],
    [
        "country-name-MT_18221",
        "Malta",
        "mt",
        "356"
    ],
    [
        "country-name-MH_18222",
        "Marshall Islands",
        "mh",
        "692"
    ],
    [
        "country-name-MQ_18223",
        "Martinique",
        "mq",
        "596"
    ],
    [
        "country-name-MR_18224",
        "Mauritania",
        "mr",
        "222"
    ],
    [
        "country-name-MU_18225",
        "Mauritius",
        "mu",
        "230"
    ],
    [
        "country-name-YT_18226",
        "Mayotte",
        "yt",
        "262"
    ],
    [
        "country-name-MX_18227",
        "Mexico",
        "mx",
        "52"
    ],
    [
        "country-name-FM_18228",
        "Micronesia",
        "fm",
        "691"
    ],
    [
        "country-name-MD_18229",
        "Moldova, Republic of",
        "md",
        "373"
    ],
    [
        "country-name-MC_18230",
        "Monaco",
        "mc",
        "377"
    ],
    [
        "country-name-MN_18231",
        "Mongolia",
        "mn",
        "976"
    ],

    [
        "country-name-MS_18232",
        "Montserrat",
        "ms",
        "1664"
    ],
    [
        "country-name-MA_18233",
        "Morocco",
        "ma",
        "212"
    ],
    [
        "country-name-MZ_18234",
        "Mozambique",
        "mz",
        "258"
    ],
    [
        "country-name-MM_18235",
        "Myanmar",
        "mm",
        "95"
    ],
    [
        "country-name-NA_18236",
        "Namibia",
        "na",
        "264"
    ],
    [
        "country-name-NR_18237",
        "Nauru",
        "nr",
        "674"
    ],
    [
        "country-name-NP_18238",
        "Nepal",
        "np",
        "977"
    ],
    [
        "country-name-NL_18239",
        "Netherlands",
        "nl",
        "31"
    ],
    [
        "country-name-AN_18240",
        "Netherlands Antilles",
        "an",
        "599"
    ],
    [
        "country-name-NC_18241",
        "New Caledonia",
        "nc",
        "687"
    ],
    [
        "country-name-NZ_18242",
        "New Zealand",
        "nz",
        "64"
    ],
    [
        "country-name-NI_18243",
        "Nicaragua",
        "ni",
        "505"
    ],
    [
        "country-name-NE_18244",
        "Niger",
        "ne",
        "227"
    ],
    [
        "country-name-NG_18245",
        "Nigeria",
        "ng",
        "234"
    ],
    [
        "country-name-NU_18246",
        "Niue",
        "nu",
        "683"
    ],
    [
        "country-name-NF_18247",
        "Norfolk Island",
        "nf",
        "672"
    ],
 
    [
        "country-name-MP_18249",
        "Northern Mariana Islands",
        "mp",
        "1670"
    ],
    [
        "country-name-NO_18250",
        "Norway",
        "no",
        "47"
    ],
    [
        "country-name-OM_18251",
        "Oman",
        "om",
        "968"
    ],
    [
        "country-name-PK_18252",
        "Pakistan",
        "pk",
        "92"
    ],
    [
        "country-name-PW_18253",
        "Palau",
        "pw",
        "680"
    ],
 
    [
        "country-name-PA_18254",
        "Panama",
        "pa",
        "507"
    ],
    [
        "country-name-PG_18255",
        "Papua New Guinea",
        "pg",
        "675"
    ],
    [
        "country-name-PY_18256",
        "Paraguay",
        "py",
        "595"
    ],
    [
        "country-name-PE_18257",
        "Peru",
        "pe",
        "51"
    ],
    [
        "country-name-PH_18258",
        "Philippines",
        "ph",
        "63"
    ],
    [
        "country-name-PN_18259",
        "Pitcairn",
        "pn",
        "64"
    ],
    [
        "country-name-PL_18260",
        "Poland",
        "pl",
        "48"
    ],
    [
        "country-name-PT_18261",
        "Portugal",
        "pt",
        "351"
    ],
    [
        "country-name-PR_18262",
        "Puerto Rico",
        "pr",
        "1",
        3,
        [
            "787",
            "939"
        ]
    ],
    [
        "country-name-QA_18263",
        "Qatar",
        "qa",
        "974"
    ],
 
    [
        "country-name-RE_18264",
        "Reunion",
        "re",
        "262"
    ],
    [
        "country-name-RO_18265",
        "Romania",
        "ro",
        "40"
    ],
   
    [
        "country-name-RW_18268",
        "Rwanda",
        "rw",
        "250"
    ],
    

    [
        "country-name-ST_18274",
        "Sao Tome and Principe",
        "st",
        "239"
    ],
   [
        "country-name-VC_18271",
        "Saint Vincent and the Grenadines",
        "vc",
        "1784"
    ],
   [
        "country-name-WS_18272",
        "Samoa (Independent)",
        "ws",
        "685"
    ],
    [
        "country-name-SA_18275",
        "Saudi Arabia",
        "sa",
        "966"
    ],
  
    [
        "country-name-RS_18267",
        "Serbia",
        "rs",
        "381"
    ],
    [
        "country-name-SC_18278",
        "Seychelles",
        "sc",
        "248"
    ],
    [
        "country-name-SL_18279",
        "Sierra Leone",
        "sl",
        "232"
    ],
    [
        "country-name-SG_18280",
        "Singapore",
        "sg",
        "65"
    ],
   
    [
        "country-name-SK_18281",
        "Slovakia",
        "sk",
        "421"
    ],
    [
        "country-name-SI_18282",
        "Slovenia (Slovenija)",
        "si",
        "386"
    ],
    [
        "country-name-SB_18283",
        "Solomon Islands",
        "sb",
        "677"
    ],
    [
        "country-name-SO_18284",
        "Somalia",
        "so",
        "252"
    ],
    [
        "country-name-ZA_18285",
        "South Africa",
        "za",
        "27"
    ],
 
    [
        "countrycode_ss",
        "South Sudan",
        "ss",
        "211"
    ],
    [
        "country-name-ES_18288",
        "Spain",
        "es",
        "34"
    ],
    [
        "country-name-LK_18289",
        "Sri Lanka",
        "lk",
        "94"
    ],
 [
        "country-name-KN_18269",
        "Saint Kitts and Nevis",
        "kn",
        "1869"
    ],
    [
        "country-name-LC_18270",
        "Saint Lucia",
        "lc",
        "1758"
    ],
 [
        "country-name-PM_18291",
        "St. Pierre and Miquelon",
        "pm",
        "508"
    ],

 [
        "country-name-SH_18290",
        "St. Helena",
        "sh",
        "290"
    ],


    [
        "country-name-SR_18292",
        "Suriname",
        "sr",
        "597"
    ],
    [
        "country-name-SJ_18293",
        "Svalbard and Jan Mayen Islands",
        "sj",
        "47"
    ],
    [
        "country-name-SZ_18294",
        "Swaziland",
        "sz",
        "268"
    ],
    [
        "country-name-SE_18295",
        "Sweden",
        "se",
        "46"
    ],
    [
        "country-name-CH_18296",
        "Switzerland",
        "ch",
        "41"
    ],
    [
        "country-name-SY_18345",
        "Syria",
        "sy",
        "963"
    ],
    [
        "country-name-TW_18297",
        "Taiwan",
        "tw",
        "886"
    ],

    [
        "country-name-TZ_18299",
        "Tanzania",
        "tz",
        "255"
    ],
  [
        "country-name-TL_18151",
        "Timor-Leste",
        "tl",
        "670"
    ],

    [
        "country-name-TO_18303",
        "Tonga",
        "to",
        "676"
    ],
    [
        "country-name-TT_18305",
        "Trinidad and Tobago",
        "tt",
        "1868"
    ],
    [
        "country-name-TN_18306",
        "Tunisia",
        "tn",
        "216"
    ],
    [
        "country-name-TR_18307",
        "Turkey",
        "tr",
        "90"
    ],
    [
        "country-name-TM_18308",
        "Turkmenistan",
        "tm",
        "993"
    ],
    [
        "country-name-TC_18309",
        "Turks and Caicos Islands",
        "tc",
        "1649"
    ],
    [
        "country-name-TV_18310",
        "Tuvalu",
        "tv",
        "688"
    ],
  
    [
        "country-name-UG_18312",
        "Uganda",
        "ug",
        "256"
    ],
    [
        "country-name-UA_18313",
        "Ukraine",
        "ua",
        "380"
    ],
    [
        "country-name-AE_18314",
        "United Arab Emirates",
        "ae",
        "971"
    ],
    [
        "country-name-GB_18315",
        "United Kingdom",
        "gb",
        "44"
    ],
    [
        "country-name-US_18316",
        "United States",
        "us",
        "1",
        0
    ],
    [
        "country-name-UY_18318",
        "Uruguay",
        "uy",
        "598"
    ],
    [
        "country-name-UZ_18319",
        "Uzbekistan",
        "uz",
        "998"
    ],
    [
        "country-name-VU_18320",
        "Vanuatu",
        "vu",
        "678"
    ],
    [
        "country-name-VA_18321",
        "Vatican City State (Holy See)",
        "va",
        "39",
        1
    ],
    [
        "country-name-VE_18322",
        "Venezuela",
        "ve",
        "58"
    ],
    [
        "country-name-VN_18323",
        "Vietnam",
        "vn",
        "84"
    ],
 [
        "country-name-VI_18325",
        "British Virgin Islands",
        "vg",
        "1284"
    ],
 [
        "country-name-VI_18325",
        "U.S. Virgin Islands",
        "vi",
        "1340"
    ],
    [
        "country-name-WF_18327",
        "Wallis and Futuna Islands",
        "wf",
        "681"
    ],
    [
        "country-name-EH_18328",
        "Western Sahara",
        "eh",
        "212"
    ],
    [
        "country-name-YE_18329",
        "Yemen",
        "ye",
        "967"
    ],
    [
        "country-name-ZM_18331",
        "Zambia",
        "zm",
        "260"
    ],
    [
        "country-name-ZW_18332",
        "Zimbabwe",
        "zw",
        "263"
    ] ];
    for (var i = 0; i < allCountries.length; i++) {
        var c = allCountries[i];
        allCountries[i] = {
            name: c[0],
            iso2: c[1],
            dialCode: c[2],
            priority: c[3] || 0,
            areaCodes: c[4] || null
        };
    }
    
});
