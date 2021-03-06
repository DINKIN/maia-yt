import { ServicePort } from '../../libs/messaging/ServicePort';
import { Component } from '../../libs/Component';
import { PlayerApi, PlayerState, PlaybackQuality } from './PlayerApi';
import { PlayerListenable, PlayerEvent } from './PlayerListenable';
import { EventType } from './EventType';
import { Event } from '../../libs/events/Event';
import { PlayerData, PlayerConfig } from "./PlayerConfig";

declare interface PlayerApiElement extends Element {
  getApiInterface: () => string[];
}

declare interface VolumeChangeDetail {
  muted: boolean;
  volume: number;
}

declare interface FullscreenChangeDetail {
  fullscreen: number;
  time: number;
  videoId: string;
}

declare interface VideoDataChangeDetail {
  playertype: number;
  type: string;
}

export class Player extends Component {
  private _id: string;
  private _element: Element;
  private _config: PlayerConfig;
  private _port: ServicePort;

  private _api: PlayerApi;

  private _youtubeEvents: {[key: string]: Function} = {};
  private _preventDefaultEvents: {[key: string]: boolean} = {};

  private _playerListenable: PlayerListenable;

  constructor(id: string, element: Element, playerConfig: PlayerConfig, port: ServicePort) {
    super();
    this._id = id;
    this._element = element;
    this._config = playerConfig;
    this._port = port;

    // Wrap the player methods to allow for modifying the input.
    const api = this.getApi();
    for (let key in api) {
      if (api.hasOwnProperty(key)) {
        (this._element as any)[key] = (...args: any[]) => this.callApi(key, ...args);
      }
    }
  }
  
  protected disposeInternal() {
    super.disposeInternal();

    const api = this.getApi();
    for (let key in api) {
      if (api.hasOwnProperty(key)) {
        (this._element as any)[key] = (api as any)[key];
      }
    }

    if (this._playerListenable) {
      this._playerListenable.dispose();
    }

    delete this._playerListenable;
    delete this._element;
    delete this._api;
    delete this._port;
  }

  getElement(): Element {
    return this._element;
  }
  
  callApi(name: string, ...args: any[]): any {
    let returnValue: { value: any }|undefined = undefined;
    switch (name) {
      case "addEventListener":
        this._addEventListener(args[0], args[1]);
        break;
      case "removeEventListener":
        this._removeEventListener(args[0], args[1]);
        break;
      case "destroy":
        this._fireEvent(new PlayerEvent(null, "destroy", this), EventType.DESTROY);
        break;
      case "loadVideoByPlayerVars":
      case "cueVideoByPlayerVars":
      case "updateVideoData":
        args[0] = this._port.callSync("player#data-update", this._id, args[0]) as PlayerData || args[0];
      default:
        returnValue = this._port.callSync("player#api-call", this._id, name, ...args);
        break;
    }

    if (!returnValue) {
      const api = this.getApi();
      let value = (api as any)[name](...args);

      return value;
    } else {
      return returnValue.value;
    }
  }
  
  private _addEventListener(type: string, fn: Function|string): void {
    const api = this.getApi();
    if (this.isDisposed()) {
      api.addEventListener(type, fn);
    } else {
      this.getPlayerListenable().ytAddEventListener(type, fn);
    }
  }
  
  private _removeEventListener(type: string, fn: Function|string): void {
    const api = this.getApi();
    if (this.isDisposed()) {
      api.removeEventListener(type, fn);
    } else {
      this.getPlayerListenable().ytRemoveEventListener(type, fn);
    }
  }

  public getPlayerListenable(): PlayerListenable {
    if (!this._playerListenable) {
      this._playerListenable = new PlayerListenable(this.getApi());
    }
    return this._playerListenable;
  }

  enterDocument() {
    super.enterDocument();

    let player = this.getPlayerListenable();

    this.getHandler()
      .listen(player, "onReady", this._handleOnReady, false)
      .listen(player, "onStateChange", this._handleStateChange, false)
      .listen(player, "onVolumeChange", this._handleVolumeChange, false)
      .listen(player, "onFullscreenChange", this._handleFullscreenChange, false)
      .listen(player, "onPlaybackQualityChange", this._handlePlaybackQualityChange, false)
      .listen(player, "onPlaybackRateChange", this._handlePlaybackRateChange, false)
      .listen(player, "onApiChange", this._handleApiChange, false)
      .listen(player, "onError", this._handleError, false)
      .listen(player, "onDetailedError", this._handleDetailedError, false)
      .listen(player, "SIZE_CLICKED", this._handleSizeClicked, false)
      .listen(player, "onAdStateChange", this._handleAdStateChange, false)
      .listen(player, "onSharePanelOpened", this._handleSharePanelOpened, false)
      .listen(player, "onPlaybackAudioChange", this._handlePlaybackAudioChange, false)
      .listen(player, "onVideoDataChange", this._handleVideoDataChange, false)
      .listen(player, "onPlaylistUpdate", this._handlePlaylistUpdate, false)
      .listen(player, "onCueRangeEnter", this._handleCueRangeEnter, false)
      .listen(player, "onCueRangeExit", this._handleCueRangeExit, false)
      .listen(player, "onCueRangeMarkersUpdated", this._handleCueRangeMarkersUpdated, false)
      .listen(player, "onCueRangesAdded", this._handleCueRangesAdded, false)
      .listen(player, "onCueRangesRemoved", this._handleCueRangesRemoved, false)
      .listen(player, "CONNECTION_ISSUE", this._handleConnectionIssue, false)
      .listen(player, "SHARE_CLICKED", this._handleShareClicked, false)
      .listen(player, "WATCH_LATER_VIDEO_ADDED", this._handleWatchLaterVideoAdded, false)
      .listen(player, "WATCH_LATER_VIDEO_REMOVED", this._handleWatchLaterVideoRemoved, false)
      .listen(player, "WATCH_LATER_ERROR", this._handleWatchLaterError, false)
      .listen(player, "onLoadProgress", this._handleLoadProgress, false)
      .listen(player, "onVideoProgress", this._handleVideoProgress, false)
      .listen(player, "onReloadRequired", this._handleReloadRequired, false)
      .listen(player, "onPlayVideo", console.log.bind(console, "onPlayVideo"), false)
      .listen(player, "onPlaylistNext", console.log.bind(console, "onPlaylistNext"), false)
      .listen(player, "onPlaylistPrevious", console.log.bind(console, "onPlaylistPrevious"), false);
  }

  exitDocument() {
    super.exitDocument();
  }

  getId(): string {
    return this._id;
  }

  getApi(): PlayerApi {
    if (!this._api) {
      let player = this._element as PlayerApiElement;
      if (!player) throw new Error("Player (" + this.getId() + ") is not initialized.");

      // Determine whether the API interface is on the element.
      if (typeof player.getApiInterface !== "function") {
        throw new Error("No API interface on player element.");
      }

      // List of all the available API methods.
      let apiList = player.getApiInterface();

      let api = {} as PlayerApi;

      // Populate the API object with the player API.
      for (let i = 0; i < apiList.length; i++) {
        let key = apiList[i];
        (api as any)[key] = (player as any)[key];
      }

      this._api = api;
    }

    return this._api;
  }

  setLoaded(loaded: boolean): void {
    Object.defineProperty(this._config, 'loaded', {
      "get": () => loaded,
      "set": () => {},
      "enumerable": true,
      "configurable": true
    });
  }

  private _fireEvent(e: PlayerEvent, type: EventType, ...args: any[]) {
    const preventDefault = this._port.callSync("player#event", this.getId(), type, ...args) as boolean;

    if (preventDefault) {
      e.preventDefault();
    }
  }
  
  private _handleOnReady(e: PlayerEvent) {
    this._fireEvent(e, EventType.READY);
  }

  private _handleStateChange(e: PlayerEvent) {
    let state = e.detail as PlayerState;

    let type: EventType;
    switch (state) {
      case -1:
        type = EventType.UNSTARTED;
        break;
      case 0:
        type = EventType.ENDED;
        break;
      case 1:
        type = EventType.PLAYED;
        break;
      case 2:
        type = EventType.PAUSED;
        break;
      case 3:
        type = EventType.BUFFERING;
        break;
      case 5:
        type = EventType.CUED;
        break;
      default:
        return;
    }
  
    this._fireEvent(e, type);
  }
  
  private _handleVolumeChange(e: PlayerEvent) {
    let detail = e.detail as VolumeChangeDetail;
    this._fireEvent(e, EventType.VOLUME_CHANGE, detail.volume, detail.muted);
  }
    
  private _handleFullscreenChange(e: PlayerEvent) {
    let detail = e.detail as FullscreenChangeDetail;
    this._fireEvent(e, EventType.FULLSCREEN_CHANGE, detail.fullscreen);
  }

  private _handlePlaybackQualityChange(e: PlayerEvent) {
    let quality = e.detail as PlaybackQuality;
    this._fireEvent(e, EventType.QUALITY_CHANGE, quality);
  }

  private _handlePlaybackRateChange(e: PlayerEvent) {
    let rate = e.detail as number;
    this._fireEvent(e, EventType.RATE_CHANGE, rate);
  }

  private _handleApiChange(e: PlayerEvent) {
    this._fireEvent(e, EventType.API_CHANGE);
  }

  private _handleError(e: PlayerEvent) {
    let errorCode = e.detail as number;
    this._fireEvent(e, EventType.ERROR, errorCode);
  }
  
  private _handleDetailedError(e: PlayerEvent) {
    console.log("DetailedError", e.detail);
  }

  private _handleSizeClicked(e: PlayerEvent) {
    this._fireEvent(e, EventType.SIZE_CHANGE, e.detail as boolean);
  }
  
  private _handleAdStateChange(e: PlayerEvent) {
    let state = e.detail as PlayerState;
    
    let type: EventType;
    switch (state) {
      case -1:
        type = EventType.AD_UNSTARTED;
        break;
      case 0:
        type = EventType.AD_ENDED;
        break;
      case 1:
        type = EventType.AD_PLAYED;
        break;
      case 2:
        type = EventType.AD_PAUSED;
        break;
      case 3:
        type = EventType.AD_BUFFERING;
        break;
      case 5:
        type = EventType.AD_CUED;
        break;
      default:
        return;
    }
  
    this._fireEvent(e, type);
  }

  private _handleSharePanelOpened(e: PlayerEvent) {
    this._fireEvent(e, EventType.SHARE_PANEL_OPENED);
  }

  private _handlePlaybackAudioChange(e: PlayerEvent) {
    console.log("PlaybackAudioChange", e.detail);
  }

  private _handleVideoDataChange(e: PlayerEvent) {
    const data = e.detail as VideoDataChangeDetail;
    this._fireEvent(e, EventType.VIDEO_DATA_CHANGE, data.type, data.playertype);
  }
  
  private _handlePlaylistUpdate(e: PlayerEvent) {
    this._fireEvent(e, EventType.PLAYLIST_UPDATE);
  }
  
  private _handleCueRangeEnter(e: PlayerEvent) {
    this._fireEvent(e, EventType.CUE_RANGE_ENTER, e.detail);
  }

  private _handleCueRangeExit(e: PlayerEvent) {
    this._fireEvent(e, EventType.CUE_RANGE_EXIT, e.detail);
  }

  private _handleCueRangeMarkersUpdated(e: PlayerEvent) {
    console.log("CueRangeMarkersUpdated", e.detail);
  }

  private _handleCueRangesAdded(e: PlayerEvent) {
    console.log("CueRangesAdded", e.detail);
  }

  private _handleCueRangesRemoved(e: PlayerEvent) {
    console.log("CueRangesRemoved", e.detail);
  }

  private _handleConnectionIssue(e: PlayerEvent) {
    this._fireEvent(e, EventType.CONNECTION_ISSUE);
  }

  private _handleShareClicked(e: PlayerEvent) {
    this._fireEvent(e, EventType.SHARE_CLICKED);
  }

  private _handleWatchLaterVideoAdded(e: PlayerEvent) {
    console.log("WatchLaterVideoAdded", e.detail);
  }

  private _handleWatchLaterVideoRemoved(e: PlayerEvent) {
    console.log("WatchLaterVideoRemoved", e.detail);
  }

  private _handleWatchLaterError(e: PlayerEvent) {
    console.log("WatchLaterError", e.detail);
  }

  private _handleLoadProgress(e: PlayerEvent) {
    const progress = e.detail as number;
    this._fireEvent(e, EventType.LOAD_PROGRESS, progress);
  }

  private _handleVideoProgress(e: PlayerEvent) {
    const progress = e.detail as number;
    this._fireEvent(e, EventType.VIDEO_PROGRESS, progress);
  }

  private _handleReloadRequired(e: PlayerEvent) {
    this._fireEvent(e, EventType.RELOAD_REQUIRED);
  }
}