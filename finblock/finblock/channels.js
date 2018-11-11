// Must run on background page

// TODO: make google search results ALWAYS show photos.  Special case it.

// Inputs: width:int, height:int, url:url, title:string, attribution_url:url
class Listing {
    constructor(data) {
        this.width = data.width;
        this.height = data.height;
        this.url = data.url;
        this.title = data.title;
        this.attribution_url = data.attribution_url;
    }
}


// Contains and provides access to all the photo channels.
class Channels {
    constructor() {
        var that = this;
        this._channelGuide = undefined; // maps channel ids to channels and metadata
        this._loadFromStorage();
        this.refreshAllEnabled();
        window.setInterval(
            function() { that.refreshAllEnabled(); },
            1000 * 60 * 60 * 24
        );
    }

    // Inputs:
    //   name:string - a Channel class name.
    //   param:object - the single ctor parameter to the Channel class.
    //   enabled:bool - true if this channel is to be used for pictures.
    // Returns:
    //   id of newly created channel, or undefined if the channel already existed.
    add(data) {
        // Check, whether such a class exists
        var klass = null;
        switch (data.name) {
            case "AprilFoolsCatsChannel": klass = AprilFoolsCatsChannel;
                break;
            default: return;
        }
        var dataParam = JSON.stringify(data.param);
        for (var id in this._channelGuide) {
            var c = this._channelGuide[id];
            if (c.name === data.name && JSON.stringify(c.param) === dataParam) {
                return;
            }
        }
        var id = Math.floor(Math.random() * Date.now());
        var channel = new klass(data.param);
        this._channelGuide[id] = {
            name: data.name,
            param: data.param,
            enabled: data.enabled,
            channel: channel
        };
        this._saveToStorage();
        var that = this;
        $(channel).on("updated", function() {
            // TODO: make sure this works in Safari.  And if you fix a bug, fix it
            // in AdBlock too -- it's keeping filter update events from showing up
            // in the AdBlock Options page I think.
            chrome.runtime.sendMessage({ command: "channel-updated", id: id });
            if (that._channelGuide[id].enabled) {
                that._channelGuide[id].channel.prefetch();
            }
        });
        channel.refresh();
        return id;
    }

    remove(channelId) {
        delete this._channelGuide[channelId];
        this._saveToStorage();
    }

    // Return read-only map from each channel ID to
    // { name, param, enabled }.
    getGuide() {
        var results = {};
        for (var id in this._channelGuide) {
            var c = this._channelGuide[id];
            results[id] = {
                name: c.name,
                param: c.param,
                enabled: c.enabled
            };
        }

        return results;
    }

    getListings(id) {
        return this._channelGuide[id].channel.getListings();
    }

    setEnabled(id, enabled) {
        this._channelGuide[id].enabled = enabled;
        this._saveToStorage();
    }

    refreshAllEnabled() {
        for (var id in this._channelGuide) {
            var data = this._channelGuide[id];
            if (data.enabled) {
                data.channel.refresh();
            }
        }
    }

    // Returns a random Listing from all enabled channels or from channel
    // |channelId| if specified, trying to match the ratio of |width| and
    // |height| decently.  Returns undefined if there are no enabled channels.
    randomListing(opts) {
        var allListings = [];

        for (var id in this._channelGuide) {
            var data = this._channelGuide[id];
            if (opts.channelId === id || (data.enabled && !opts.channelId)) {
                allListings.push.apply(allListings, data.channel.getListings());
            }
        }
        // TODO: care about |width| and |height|
        var randomIndex = Math.floor(Math.random() * allListings.length);
        return allListings[randomIndex];
    }

    _loadFromStorage() {
        this._channelGuide = {};

        var entries = storage_get("channels");
        if (!entries || (entries.length > 0 && !entries[0].name)) {
            // Default set of channels
            if (storage_get("project_cats")) {
                this.add({ name: "TheCatsOfProjectCATS", param: undefined, enabled: true });
                this.add({ name: "TheCatsOfFinBlockUsersChannel", param: undefined,
                      enabled: false });
                this.add({ name: "AprilFoolsCatsChannel", param: undefined, enabled: false });
            } else {
                this.add({ name: "TheCatsOfFinBlockUsersChannel", param: undefined,
                      enabled: true });
                this.add({ name: "AprilFoolsCatsChannel", param: undefined, enabled: true });
                this.add({ name: "TheCatsOfProjectCATS", param: undefined, enabled: false });
            }
        } else {
            for (var i=0; i < entries.length; i++) {
                this.add(entries[i]);
            }
        }
    }

    _saveToStorage() {
        var toStore = [];
        var guide = this.getGuide();
        for (var id in guide) {
            toStore.push(guide[id]);
        }
        storage_set("channels", toStore);
    }
}

// Base class representing a channel of photos.
// Concrete constructors must accept a single argument, because Channels.add()
// relies on that.
class Channel {
    constructor() {
        this.__listings = [];
    }



    getListings() {
        return this.__listings.slice(0); // shallow copy
    }

    // Update the channel's listings and trigger an 'updated' event.
    refresh() {
        var that = this;
        this._getLatestListings(function(listings) {
            that.__listings = listings;
            $(that).trigger("updated");
        });
    }

    // Load all photos so that they're in the cache.
    prefetch() {
        this.__listings.forEach(function(listing) {
            setTimeout(function() {
                new Image().src = listing.url;
            }, 0);
        });
    }

    _getLatestListings() {
        throw new Error("Implemented by subclass. Call callback with up-to-date listings.");
    }
}

var news = null;
// Channel containing hard coded cats loaded from disk.
class AprilFoolsCatsChannel extends Channel {
    constructor() {
      super();
    }

    getNews() {
      var url = 'https://newsapi.org/v2/everything?' +
          'q=fintech&' +
          'from=2018-11-10&' +
          'sortBy=popularity&' +
          'apiKey=d66b2b805662461084b13f97ae31d880';
      var req = new Request(url);

      const request = async () => {
        const response = await fetch(req);
        news = await response.json();
        console.log(news);
      }
      request();
    }

    async _getLatestListings(callback) {
       this.getNews();
       if (news === null) {
         setTimeout(function(){
            console.log(news.status);
            console.log(news.articles[0].title);

            function L(w, h, data) {
                var folder = chrome.runtime.getURL("finblock/pix/");
                return new Listing({
                    width: w, height: h, url: data.urlToImage,
                    attribution_url: data.url,
                    title: data.title
                });
            }
            // the listings never change
            callback([
                //L(270, 256, news.articles[0]),
                L(270, 256, news.articles[0]),
                //L(350, 263, news.articles[1]),
                L(270, 256, news.articles[1]),
                //L(228, 249, news.articles[2]),
                L(270, 256, news.articles[2]),
                //
                L(236, 399, news.articles[3]),
                L(340, 375, news.articles[4]),
                L(170, 240, news.articles[5]),
                L(384, 288, news.articles[6]),
            ]);

          },3000);
       }

    }

}


// Abstract base class for Flickr-based Channels.
