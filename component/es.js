'use strict';

polarity.export = PolarityComponent.extend({
  details: Ember.computed.alias('block.data.details'),
  hadHighlightLoadingError: false,
  loadingHighlights: false,
  isSearchLimitReached: Ember.computed('block.data.details', function () {
    return (
      this.get('details.isConnectionReset') ||
      this.get('details.maxRequestQueueLimitHit') ||
      this.get('details.isGatewayTimeout') ||
      this.get('details.isProtoError')
    );
  }),
  init() {
    this._super(...arguments);

    this.initHighlights();

    if (!this.get('block._state')) {
      this.set('block._state', {});
      this.set('block._state.searchRunning', false);
      this.set('block._state.highlightsLoading', false);
      this.set('block._state.paging', {});
      this.updatePageParameters();
    }

    if (!this.get('details.highlights') && !this.get('isSearchLimitReached')) {
      this.loadHighlights();
    }
  },
  actions: {
    retrySearch: function () {
      this.runSearch();
    },
    showHighlights: function (index) {
      this.set('details.results.' + index + '.showTable', false);
      this.set('details.results.' + index + '.showJson', false);
      this.set('details.results.' + index + '.showSource', false);
      this.set('details.results.' + index + '.showHighlights', true);
    },
    showTable: function (index) {
      this.set('details.results.' + index + '.showTable', true);
      this.set('details.results.' + index + '.showJson', false);
      this.set('details.results.' + index + '.showSource', false);
      this.set('details.results.' + index + '.showHighlights', false);
    },
    showJson: function (index) {
      if (typeof this.get('details.results.' + index + '.json') === 'undefined') {
        this.set(
          'details.results.' + index + '.json',
          this.syntaxHighlight(JSON.stringify(this.get('details.results.' + index + '.hit'), null, 4))
        );
      }
      this.set('details.results.' + index + '.showTable', false);
      this.set('details.results.' + index + '.showJson', true);
      this.set('details.results.' + index + '.showSource', false);
      this.set('details.results.' + index + '.showHighlights', false);
    },
    showSource: function (index) {
      this._initSource(index);
      this.set('details.results.' + index + '.showTable', false);
      this.set('details.results.' + index + '.showJson', false);
      this.set('details.results.' + index + '.showSource', true);
      this.set('details.results.' + index + '.showHighlights', false);
    },
    toggleTabs: function (index) {
      this.toggleProperty('details.results.' + index + '.showTabs', false);
    },
    setPage(fromIndex) {
      this.runSearch(fromIndex);
    }
  },
  updatePageParameters() {
    let from = +this.get('details.from');
    let size = +this.get('details.size');
    let totalResults = this.get('details.totalResults');

    if (totalResults <= size) {
      this.set('block._state.paging.allResultsReturned', true);
    }

    this.set('block._state.paging.startItem', from + 1);
    this.set('block._state.paging.endItem', from + size + 1 > totalResults ? totalResults : from + size);

    const finalPagingIndex = totalResults % size === 0 ? totalResults - size : totalResults - (totalResults % size);
    const nextPageIndex = from + size >= totalResults - 1 ? finalPagingIndex : from + size;
    const prevPageIndex = from - size < 0 ? 0 : from - size;
    const firstPageIndex = 0;
    const lastPageIndex = size < totalResults ? finalPagingIndex : 0;

    this.set('block._state.paging.nextPageIndex', nextPageIndex);
    this.set('block._state.paging.prevPageIndex', prevPageIndex);
    this.set('block._state.paging.firstPageIndex', firstPageIndex);
    this.set('block._state.paging.lastPageIndex', lastPageIndex);

    // There are no more pages to show so we can disable the next buttons
    if (this.get('block._state.paging.endItem') === totalResults) {
      this.set('block._state.paging.disableNextButtons', true);
    } else {
      this.set('block._state.paging.disableNextButtons', false);
    }

    // There are no more pages to show so we can disable the prev buttons
    if (this.get('block._state.paging.startItem') === 1) {
      this.set('block._state.paging.disablePrevButtons', true);
    } else {
      this.set('block._state.paging.disablePrevButtons', false);
    }
  },
  _initSource(index) {
    if (typeof this.get('details.results.' + index + '.sourceStringified') === 'undefined') {
      const _source = this.get('details.results.' + index + '.hit._source');
      const _sourceStringified = {};
      Object.entries(_source).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null && Array.isArray(value) === false) {
          _sourceStringified[key] = JSON.stringify(value, null, 0);
        } else {
          _sourceStringified[key] = value;
        }
      });
      this.set('details.results.' + index + '.sourceStringified', _sourceStringified);
    }
  },
  syntaxHighlight(json) {
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      function (match) {
        var cls = 'number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'key';
          } else {
            cls = 'string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'boolean';
        } else if (/null/.test(match)) {
          cls = 'null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
      }
    );
  },
  loadHighlights: function () {
    this.set('block._state.highlightsLoading', true);
    this.set('block._state.errorMessage', '');
    const documentIds = this.get('details.results').map((item) => {
      return item.hit._id;
    });

    const payload = {
      action: 'HIGHLIGHT',
      documentIds,
      entity: this.get('block.entity'),
      from: this.get('details.from')
    };

    this.sendIntegrationMessage(payload)
      .then((result) => {
        this.set('details.highlights', result.highlights);
        this.set('hadHighlightLoadingError', false);
        this.initHighlights();
      })
      .catch((err) => {
        console.info(err);
        this.set(
          'block._state.errorMessage',
          err.meta && err.meta.detail ? err.meta.detail : 'Unexpected error encountered loading highlights.'
        );
        this.set('hadHighlightLoadingError', true);
      })
      .finally(() => {
        this.set('block._state.highlightsLoading', false);
        this.get('block').notifyPropertyChange('data');
      });
  },
  runSearch(from = 0) {
    this.set('block._state.errorMessage', '');
    this.set('block._state.searchRunning', true);
    this.set('block._state.paging.disableNextButtons', true);
    this.set('block._state.paging.disablePrevButtons', true);

    const payload = {
      action: 'SEARCH',
      entity: this.get('block.entity'),
      from
    };

    this.sendIntegrationMessage(payload)
      .then((result) => {
        this.set('details', result.details);
        this.initHighlights();
      })
      .catch((error) => {
        // timeout error occurs when the onMessage hook times out due to the endpoint taking too long
        if (this.isTimeoutError(error)) {
          if (!this.get('details')) {
            this.set('details', {});
          }
          this.set('details.onMessageTimeout', true);
        } else {
          this.set('block._state.errorMessage', JSON.stringify(error, null, 4));
        }
      })
      .finally(() => {
        this.set('block._state.searchRunning', false);
        this.updatePageParameters();
      });
  },
  /**
   * Returns true if the onMessage error is a timeout
   * @param error
   * @returns {boolean}
   */
  isTimeoutError(error) {
    return error.status === '504';
  },
  initHighlights() {
    this.get('details.results').forEach((result, index) => {
      this._initSource(index);
      Ember.set(result, 'showHighlights', false);
      Ember.set(result, 'showTable', true);
      Ember.set(result, 'showJson', false);
      Ember.set(result, 'showSource', false);
    });
  }
});
