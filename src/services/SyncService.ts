import axios, { isAxiosError } from 'axios';
import { uuid } from 'uuidv4';
import {
  ApiResponse,
  Bases,
  FormatMethods,
  IndexSignatureType,
  Managers,
  ParserMethods,
  Paths,
  PrismaCreate,
  PrismaSalesCreate,
  Request,
  RequestMethods,
  SalesSchema,
  Schemas,
  SyncerConfig,
} from '../types';
import {
  addressToBuffer,
  createQuery,
  incrementDate,
  isValidDate,
  toBuffer,
} from '../utils';
import { BackupService } from './BackupService';
import { InsertionService } from './InsertionService';
import { SyncManager } from './SyncManager';

/*
 * The URL paths for the sync APIs
 */
export const URL_PATHS: Paths = {
  sales: '/sales/v4',
};
/**
 * The URL bases for the sync APIs
 */
export const URL_BASES: Bases = {
  mainnet: 'https://api.reservoir.tools',
  goerli: 'https://api-goerli.reservoir.tools',
  optimism: 'https://api-optimism.reservoir.tools',
  polygon: 'https://api-polygon.reservoir.tools',
};
/**
 * Formatting methods for the raw API responses
 */
export const FORMAT_METHODS: FormatMethods = {
  sales: (sales: SalesSchema[]) => {
    if (!sales) return [];
    return sales?.map((sale: SalesSchema) => {
      return {
        id: Buffer.from(`${sale.txHash}-${sale.logIndex}-${sale.batchIndex}`),
        sale_id: toBuffer(sale.saleId),
        token_id: sale.token.tokenId,
        contract_id: addressToBuffer(sale.token.contract),
        order_id: addressToBuffer(sale.orderId),
        order_source: sale.orderSource,
        order_side: sale.orderSide,
        order_kind: sale.orderKind,
        amount: sale.amount,
        from: addressToBuffer(sale.from),
        to: addressToBuffer(sale.to),
        fill_source: sale.fillSource,
        block: sale.block,
        tx_hash: addressToBuffer(sale.txHash),
        log_index: sale.logIndex,
        batch_index: sale.batchIndex,
        timestamp: sale.timestamp,
        wash_trading_score: sale.washTradingScore,
        created_at: sale.createdAt,
        price_currency_contract: addressToBuffer(sale.price.currency.contract),
        updated_at: sale.updatedAt,
        price_currency_name: sale.price.currency.name,
        price_currency_symbol: sale.price.currency.symbol,
        price_currency_decimals: sale.price.currency.decimals,
        price_amount_raw: sale.price.amount.raw,
        price_amount_decimal: sale.price.amount.decimal,
        price_amount_usd: sale.price.amount.usd,
        price_amount_native: sale.price.amount.native,
        isDeleted: sale.isDeleted,
      };
    });
  },
};
/**
 * Parser methods for the raw API responses
 */
export const PARSER_METHODS: ParserMethods = {
  sales: (sales, contracts) => {
    if (contracts && contracts?.length > 0) {
      sales = sales.filter((s: { token: { contract: string } }) =>
        contracts
          .map((s: string) => s.toLowerCase())
          .includes(s.token.contract.toLowerCase())
      );
    }
    return FORMAT_METHODS['sales'](sales) as PrismaSalesCreate[];
  },
};
/**
 * Request methods to return data from the API
 */
export const REQUEST_METHODS: RequestMethods = {
  sales: async ({ url, query, apiKey }): Promise<ApiResponse> => {
    try {
      const _res = await axios.get(`${url}?${query}`, {
        timeout: 100000,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
      });
      if (_res.status !== 200) throw _res;
      return {
        status: _res.status,
        data: _res.data,
      };
    } catch (err: any) {
      if (isAxiosError(err)) {
        return {
          status: err.response?.status || 500,
          data: err.response?.data,
        };
      }
      return {
        status: 500,
        data: {
          status: 500,
          message: 'Unknown error.',
          error: err,
        },
      };
    }
  },
};

/**
 * The SyncService class handles assigning managers
 * to months so that the manager can process the data for that month and once
 * done can continue to upkeep or schedule itself for deletion
 * They can delete, create, and update managers
 */
export class SyncService {
  /**
   * # _apiKey
   * Reservoir API key to use for API request
   * @access private
   * @type {String}
   */
  private _apiKey: string;

  /**
   * # _isBackfilled
   * @access private
   * @type {Boolean}
   */
  private _isBackfilled: boolean;

  /**
   * # _date
   * The date to increment by
   * @access private
   * @type {String}
   */
  private _date: string;

  /**
   * # config
   * SyncService instance config
   * @access public
   * @type {SyncerConfig}
   */
  public readonly config: SyncerConfig;

  /**
   * # managers
   * SyncManager map
   * @access public
   * @type {Map<string, SyncManager>}
   */
  public managers: Map<string, SyncManager>;
  constructor(config: SyncerConfig) {
    /**
     * Set public variables
     */
    this.config = config;
    this.managers = new Map();

    /**
     * Set private variables
     */
    this._date = config.date;
    this._apiKey = config.apiKey;
    this._isBackfilled = false;
  }

  /**
   * # launch
   * Launches the SyncService
   * @access public
   * @returns {Promise<void>} Promise<void>
   */
  public launch(): void {
    this.config.backup?.data.managers
      ? this._restoreManagers()
      : this._createManagers();
    this._launchManagers();
  }
  /**
   * # _createManagers
   * Creates month managers for the sync service
   * @access private
   * @returns {Promise<void>} Promise<void>
   */
  private _createManagers(): void {
    for (let i = 0; i < Number(this.config.managerCount || 1); i++) {
      if (i !== 0) {
        const { date } = incrementDate(`${this._date.substring(0, 7)}-01`, {
          months: 1,
        });
        if (!isValidDate(date)) return;
        this._date = date;
      }
      const id = `${this.config.type}-manager-${uuid()}`;
      this.managers.set(
        id,
        new SyncManager({
          id,
          date: this._date,
          insert: this._insert.bind(this),
          request: this._request.bind(this),
          parse: this._parse.bind(this),
          format: this._format.bind(this),
          review: this._reviewManager.bind(this),
          count: this._count.bind(this),
          backup: this._backup.bind(this),
          workerCount: Number(this.config.workerCount || 1),
        })
      );
    }
  }
  /**
   * # _restoreManagers
   * Restores month managers for the sync service from a backup
   * @access private
   * @returns {void} Promise<void>
   */
  private _restoreManagers(): void {
    this.managers = this.config?.backup?.data.managers.reduce(
      (managers, manager) => {
        const id = `${this.config.type}-manager-${uuid()}`;
        return managers.set(
          id,
          new SyncManager({
            id,
            date: manager.date,
            insert: this._insert.bind(this),
            request: this._request.bind(this),
            parse: this._parse.bind(this),
            format: this._format.bind(this),
            count: this._count.bind(this),
            review: this._reviewManager.bind(this),
            backup: this._backup.bind(this),
            workers: manager.workers,
            workerCount: Number(this.config.workerCount || 1),
          })
        );
      },
      new Map<string, SyncManager>()
    ) as Managers;
  }
  /**
   * # _createBackup
   * Backups the current state of the LightNode
   * @access private
   * @returns {void}
   */
  private async _backup(): Promise<void> {
    await BackupService.backup({
      type: this.config.type,
      data: {
        date: this._date,
        managers: Array.from(this.managers.values()).map((manager) => {
          return {
            date: manager.date as string,
            timestamp: manager.timestamp,
            workers: Array.from(manager.workers.values()).map((worker) => {
              return {
                date: worker.date,
                timestamp: worker.timestamp,
                continuation: worker.continuation,
              };
            }),
          };
        }),
      },
    });
  }
  /**
   * # _deleteManager
   * Deletes an instance of a manager
   * @param {String} id - Manager instance
   * @returns {void} void
   */
  private _deleteManager(id: string): void {
    // if (Array.from(manager.workers.values()).some((worker) => worker?.isBusy))
    // return;

    this.managers.delete(id);
  }
  private _reviewManager(manager: SyncManager): boolean {
    /**
     * If the manager has a worker that hit's a cursor - it is reported as backfilled and becomes our primary manager
     * This then means that all the other managers just need to finish what they are working on and will be queued for deletion once they are done
     */
    if (manager.isBackfilled) {
      this._isBackfilled = true; // We set this backfill to true because we know a manager
      /**
       * We return becasue we dont ever want to kill this manager because it contains our worker that is upkeeping
       * We don't need to assign it new work because it will continue forever due to their backfill flag being called
       */
      this._backup();
      return true;
    } else {
      this._backup();
      return this._continueWork(manager);
    }
  }
  /**
   * # _continueWork
   * Determines if a manager should continue working or not based on the date
   * @param {SyncManager} manager - Manager instance
   * @returns void
   */
  private _continueWork(manager: SyncManager): boolean {
    const { date: _date } = incrementDate(`${this._date.substring(0, 7)}-01`, {
      months: 1,
    });

    if (isValidDate(_date)) {
      this._date = _date;
      manager.config.date = _date;
      return true;
    } else {
      return false;
    }
  }
  /**
   * # _launchMangers
   * Initial launch method for the managers
   * @access private
   * @returns  void
   */
  private async _launchManagers(): Promise<void> {
    const promises = await Promise.allSettled(
      Array.from(this.managers.values()).map((manager) => {
        return manager?.launch();
      })
    );
    promises.forEach((promise: any) => {
      this._deleteManager(promise.value);
    });
  }
  /**
   * # _count
   * Counts the amount of objects in a data array
   * @param {Schemas[]} data - array of object data
   * @returns {Promise<void>} Promise<void>
   */
  private _count(data: IndexSignatureType): number {
    return data[this.config.type].length;
  }
  /**
   * # _insert
   * Inserts data into the database using the inseriton service
   * @access private
   * @param {Prisma.ordersCreateInput | Prisma.salesCreateInput} data - An array of objects
   * @returns {Promise<void>} Promise<void>
   */
  private _insert(data: IndexSignatureType): void {
    InsertionService.upsert({
      data: this._parse(data[this.config.type]).map((value) => {
        delete value.isDeleted;
        return value;
      }),
      table: this.config.type,
    });
    InsertionService.delete({
      table: this.config.type,
      ids: this._parse(data[this.config.type])
        .filter((data) => data.isDeleted)
        .map((value) => {
          delete value.isDeleted;
          return value.id;
        }),
    });
  }
  /**
   * # _request
   * Uses the request methods to execute and return a request
   * @param {Request} Request - Request object containing a continuation and a date
   * @access private
   * @returns {Promise<ApiResponse>} Promise<ApiResponse>
   */
  private async _request({
    continuation,
    startTimestamp,
    endTimestamp,
  }: Request): Promise<ApiResponse> {
    return await REQUEST_METHODS[this.config.type as keyof RequestMethods]({
      url: `${URL_BASES[this.config.chain]}${URL_PATHS[this.config.type]}`,
      query: createQuery(
        continuation,
        this.config.contracts,
        startTimestamp,
        endTimestamp
      ),
      apiKey: this._apiKey,
    });
  }
  /**
   * # _parse
   * Parses and formats raw data from the api into the prisma format
   * @param {Schemas[]} data Schemas array
   * @returns {PrismaCreate[]} PrismaCreate[]
   */
  private _parse(data: Schemas): PrismaCreate[] {
    return PARSER_METHODS[this.config.type as keyof ParserMethods](
      data,
      this.config.contracts
    );
  }
  /**
   * # _format
   * Formats and returns an unknown dataset
   * @param {IndexSignatureType} data API response data
   * @returns {Schemas} formatted data
   */
  private _format(data: IndexSignatureType): Schemas {
    return data[this.config.type];
  }
}
