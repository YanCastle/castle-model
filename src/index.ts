import * as _ from 'lodash';
import * as Sequelize from "sequelize";
import { env } from 'process';
import hook, { HookWhen } from '@ctsy/hook'
import { ExecException } from 'child_process';
export const Op: any = Sequelize.Op;
export const Fn: any = Sequelize.fn;
export const Col: any = Sequelize.col;
export const QueryTypes = Sequelize.QueryTypes;
export enum Operate {
    Select, Add, Delete, Save
}
/**
 * 数据库操作参数对象
 */
export interface Options {
    fields: any[],
    exclude: string[],
    where: any,
    group: string[],
    order?: string[] | string,
    limit?: number,
    offset?: number,
}
/**
 * 数据库操作的Hook
 */
export enum ModelHooks {
    Select = 'Select',
    Add = 'Add',
    AddAll = 'AddAll',
    Save = "Save",
    Delete = 'Delete',
    Where = 'Where',
}
/**
 * 数据库支持的函数
 */
export enum DbFn {
    SUM = 'SUM',
    IF = 'IF',
    AVG = 'AVG',
    COUNT = 'COUNT',
    MAX = 'MAX',
    MIN = 'MIN'
}
export interface DbFnField {
    /**
     * 方法
     */
    fn?: DbFn,
    /**
     * 字段 
     */
    field: string,
    /**
     * 别名
     */
    as?: string
}
/**
 * 原始SQL
 */
export const rawSQL = Sequelize.literal
/**
 * 实例化的M方法
 * @param ctx 
 * @param Table 
 */
export function M(ctx: any | any, Table: string, Prefix: string = ""): Model {
    return new Model(ctx, Table, Prefix);
}
/**
 * 读取数据值
 * @param value 
 */
function read_value(value: any) {
    if (value instanceof Array && value[0] && value[0].dataValues) {
        return value.map((v) => v.dataValues)
    }
    if (value.dataValues) { return value.dataValues }
    return value;
}
/**
 * 模型类
 */
export default class Model {
    private _db: any;
    private _model: Sequelize.Sequelize | any;
    private _true_table_name = "";
    private _fields: any = [];
    private _table_name = "";
    /**
     * 事务存储
     */
    public transaction: Sequelize.Transaction | any;
    /**
     * 当前内部对象
     */
    private _options: Options = {
        fields: [], where: {}, group: [], exclude: []
    };
    private _config = {

    }
    private _operate: Operate = Operate.Select;
    private _getSql: boolean = false;
    get true_table_name() { return this._true_table_name; }
    get table_name() { return this._table_name; }
    sql(sql: boolean) {
        this._getSql = sql;
        return this;
    }
    public static parseWhere(where: Object) {
        if (env.DB_DIALET == 'tablestore') {
            return where;
        }
        var w: any = where;
        _.forOwn(where, (v, k) => {
            if (v instanceof Array) {
                if (k.substr(0, 1) == '$') {
                    w[Fn(...[k.substr(0, 1), ...v])]
                } else {
                    w[Op[k]] = v;
                }
                delete w[k]
            } else if (Op[k]) {
                if ('object' == typeof v) {
                    w[Op[k]] = Model.parseWhere(v);
                }
                w[Op[k]] = v;
                delete w[k]
            }
            else if ('object' == typeof v) {
                w[k] = Model.parseWhere(v);
            } else {
                if (/^`{0,1}[A-Za-z_][A-Za-z0-9_]{0,}`{0,1}$/.test(k)) {
                    w[k] = v;
                } else {
                    throw new Error('Error Where Field: ' + k);
                }
            }
        });
        return w;
        // return hook.emit(ModelHooks.Select, HookWhen.Before, this, { args: arguments, data: {} }).then(() => {
        //     return w;
        // })
        // return w;
    }
    get changeOptions() {
        let d: any = {};
        if (this._ctx.config.transaction) { d.transaction = this._ctx.config.transaction }
        d._ctx = this._ctx;
        return d;
    }
    get config() {
        return this._config;
    }
    set config(config) {
        this._config = config;
    }
    public $search = {
        // "tableName":['fields']
    }
    protected _ctx: any;
    /**
     * 构造器
     * @param Table
     * @param {string} Prefix
     */
    constructor(ctx: Object, Table: string, Prefix = "") {
        this._ctx = ctx;
        this._table_name = Table;
        this._true_table_name = Prefix + Table.replace(/([A-Z])/g, function ($0, $1) {
            return '_' + $1.toLowerCase();
        }).replace(/_(.+)/, "$1")
    }

    /**
     * 解析查询条件
     * @returns {{} | any}
     * @private
     */
    async _parse_where() {
        let w = Model.parseWhere(this._options.where);
        if (this._ctx.Secret && this._ctx.Secret.AID) {
            let fields = await this.getDbTableFields()
            if (fields.includes('AID') && undefined === w.AID) {
                w.AID = this._ctx.Secret.AID;
            }
            if (fields.includes('GID') && undefined === w.GID && this._ctx.Secret.GID > 0) {
                w.GID = this._ctx.Secret.GID;
            }
            if (fields.includes('Key') && undefined === w.Key && this._ctx.Secret.Key.length > 0) {
                w.Key = this._ctx.Secret.Key;
            }
        }
        return w;
    }
    /**
     * 获取查询字段
     * @returns {Array}
     * @private
     */
    _parse_fields(fields?: string[]) {
        if (!fields) {
            fields = this._options.fields
        }
        let rs = []
        if (fields.length == 0) {
            rs = this._ctx.config.getDbTableFields(this._table_name)
        } else {
            rs = fields instanceof Function ? fields(this._ctx) : fields;
        }
        if (this._options.exclude.length > 0) {
            for (let x of this._options.exclude) {
                delete rs[x];
            }
        }
        return rs;
    }
    /**
     * 解析排序Sort数据
     */
    _parse_order(ostr?: string | string[]) {
        if (!ostr) { ostr = this._options.order }
        var order: any[] = [];
        if ("string" == typeof ostr) {
            ostr = ostr.split(',')
        }
        if (ostr instanceof Array) {
            for (let v of ostr) {
                let p = v.trim().split(' ');
                if (p.length > 1 && !['desc', 'asc'].includes(p[1].toLowerCase())) {
                    throw new Error('Error OrderBy Rule: ' + p[1])
                }
                if (!/^`{0,1}[A-Za-z0-9_]{1,}`{0,1}$/.test(p[0])) {
                    throw new Error('Error OrderBy Field: ' + p[0])
                }
                order.push(p)
                //TODO 检查是否在这个表中，以及是否允许参与查询
            }
        }
        return order;
    }
    /**
     * 解析配置文件，生成查询属性
     * @returns {{}}
     * @private
     */
    async _parse_config() {
        let config: any = { raw: true };
        config['attributes'] = this._parse_fields();
        config['where'] = await this._parse_where();
        if (this._options.order) {
            config['order'] = this._parse_order()
        }
        if (this._options.limit) {
            config['limit'] = this._options.limit
        }
        if (this._options.offset) {
            config['offset'] = this._options.offset
        }
        if (this._options.group && this._options.group.length > 0) {
            config['group'] = this._options.group.join(',')
        }
        if (this._operate == Operate.Select && this._options.fields.length == 0) {
            config.fields = Object.keys(this._ctx.config.getDbTableFields(this._table_name))
        }
        if (this._ctx.config.transaction) {
            config.transaction = this._ctx.config.transaction;
        }
        return config;
    }
    /**
     * 获取数据库定义的字段范围
     * @param table 
     */
    async getDbTableFields(table: string = "") {
        return Object.keys(await this._ctx.config.getDbTableFields(table || this._table_name))
    }
    /**
     * 设置表的字段，默认读取所有的
     * @param fields
     */
    public setTableFields(fields: string | string[]) {
        this._fields = fields;
    }
    public define(config = {}) {
        //TODO 加载数据库表结构定义
        return this._ctx.config.getDbDefine(this._table_name);
    }
    /**
     * 获取一个Sequelize的模型
     * @returns {any}
     */
    public async getModel(): Promise<typeof Sequelize.Model | any> {
        if (!this._db) {
            this._db = await this._ctx.config.getSequelizeDb()
        }
        if (!this._model) {
            this._model = this._db.models[this._true_table_name] ? this._db.models[this._true_table_name] : this._db.define(this._true_table_name, this.define(), {
                freezeTableName: true,
                timestamps: false
            })
        }
        return this._model;
    }
    public object = function () {

    }

    /**
     * 检测是否存在并在不存在的情况下添加数据
     * @param data
     */
    public async addIfNotExist(data: Object, where: Object | null = null) {
        let d = await this.where(where || data).find()
        if (_.isObject(d)) {
            //存在
            return d;
        } else {
            //不存在
            return await this.add(data)
        }
    }
    /**
     * 保存或添加
     * @param data 
     * @param where 
     */
    async saveOrAdd(data: Object, where: Object | null = null) {
        if (!where) {
            throw new Error('条件错误')
        }
        let d = await this.where(where || data).find()
        let rs: any = false;
        if (_.isObject(d)) {
            //存在
            rs = await this.where(where).save(data);
        } else {
            //不存在
            rs = await this.add(data)
        }
        this._clean()
        return rs;
    }
    /**
     * 自增或自减
     * @param config 
     */
    public async incOrDec(config: { [index: string]: number }) {
        let db: any = await this.getModel()
        this._operate = Operate.Save;
        let keys = Object.keys(config);
        if (keys.length > 0) {
            let data: { [index: string]: Sequelize.Utils.Literal } = {};
            for (let i = 0; i < keys.length; i++) {
                data[keys[i]] = Sequelize.literal(`\`${keys[i]}\`${config[keys[i]] > 0 ? '+' : ''}${config[keys[i]]}`)
            }
            let d = await db.update(data, Object.assign({
                where: await this._parse_where(),
                options: {
                    returning: true
                }
            }, this.changeOptions));
            this._clean();
            return d[0];
        }
        return 0;
    }
    /**
     * 设定Where条件
     * @param where
     * @returns {Model.where}
     */
    public where(where: Object) {
        if (null == where) {
            this._options.where = {};
        } else
            if (_.isObject(where))
                this._options.where = Object.assign(this._options.where, where);
            else {
                console.log('Error Where', where)
            }
        return this;
    }
    /**
     * 设定字段列表，支持数组和字符串格式
     * @param {Number | String} fields
     * @param {boolean} exclude
     * @returns {Model.fields}
     */
    public fields(fields: string | string[] | DbFnField[] | any, exclude = false) {
        let t = [];
        if (_.isArray(fields)) {
            t = fields
        } else if (_.isString(fields)) {
            t = fields.split(',')
        }
        if (!exclude) {
            this._options.fields.push(...t);
        } else {
            this._options.exclude.push(...t);
        }
        return this;
    }
    /**
     * 求和
     */
    public async sum(field: string | DbFnField[], more: boolean = false) {
        if ('string' == typeof field) {
            this._options.fields.push([Fn('sum', Col(field)), field]);
        } else if (_.isArray(field)) {
            for (let i = 0; i < field.length; i++) {
                let f = field[i];
                if (!f.field) {
                    throw new Error('Should Hav DbFnFied.field')
                }
                this._options.fields.push([Fn('sum', Col(f.field)), f.as ? f.as : f.field])
            }
        }
        await this.getModel()
        return await (more ? this.select() : this.find())
    }
    /**
     * 注入方法
     * @param fn 
     * @param field 
     * @param as 
     */
    public fnField(fn: DbFn, field: string | DbFnField, as: string = '') {
        if ('string' == typeof field) {
            this._options.fields.push([Fn(fn.toLowerCase(), Col(field)), as]);
        } else if (_.isArray(field)) {
            for (let i = 0; i < field.length; i++) {
                let f = field[i];
                if (!f.field) {
                    throw new Error('Should Hav DbFnFied.field')
                }
                this._options.fields.push([Fn(fn.toLowerCase(), Col(f.field)), f.as ? f.as : f.field])
            }
        }
        return this;
    }
    /**
     * 设定排序规则，
     * @param {String} order
     * @returns {Model.order}
     */
    public order(order: string): this {
        this._options.order = order;
        return this;
    }
    /**
     * 发起查询请求
     * @returns {Bluebird<any[]>}
     */
    public async select<T>(data: { getWhere?: boolean } = {}): Promise<T[]> {
        await hook.emit(ModelHooks.Select, HookWhen.Before, this, { args: arguments, data: {} })
        let d: any = await new Promise(async (s, j) => {
            this._operate = Operate.Select
            let m: any = (await this.getModel());
            if (true === this._getSql) {
                this.page(1, 0);
                await m.findAll(Object.assign(await this._parse_config(), {
                    raw: true,
                    logging: function () {
                        for (let i = arguments.length - 1; i >= 0; i--) {
                            if (undefined !== arguments[i].where) {
                                s(arguments[i].where)
                                return;
                            }
                        }
                        j('Failed Get SQL')
                    }
                }))
            } else {
                s(await m.findAll(Object.assign(await this._parse_config())))
            }
        })
        this._clean();
        await hook.emit(ModelHooks.Select, HookWhen.After, this, { args: arguments, data: d })
        return d;
        // let data: any = [];
        // d.forEach((v: any) => {
        //     data.push(v.dataValues)
        // })
        // return data;
    }
    public async fixField(data: any) {
        if ('object' !== typeof data) {
            throw new Error('数据错误')
        }
        let field = await this.getDbTableFields()
        let t = new Date
        switch (this._operate) {
            case Operate.Add:
                if (field.includes('CTime')) {
                    if (!data.CTime)
                        data.CTime = t;
                    if (!data.CUID)
                        data.CUID = this._ctx.UID || 0;
                }
                if (field.includes('UTime')) {
                    if (!data.UTime)
                        data.UTime = new Date;
                    if (!data.UUID)
                        data.UUID = this._ctx.UID || 0;
                }
                delete data.DUID; delete data.DTime;
                if (field.includes('AID') && this._ctx.Secret && this._ctx.Secret.AID) {
                    if (!data.AID)
                        data.AID = this._ctx.Secret.AID
                }
                if (field.includes('GID') && this._ctx.Secret && this._ctx.Secret.GID) {
                    if (!data.GID)
                        data.GID = this._ctx.Secret.GID
                }
                if (field.includes('Key') && this._ctx.Secret && this._ctx.Secret.Key) {
                    if (!data.Key)
                        data.Key = this._ctx.Secret.Key
                }
                break;
            case Operate.Save:
                if (field.includes('UTime')) {
                    data.UTime = new Date;
                    if (!data.UUID)
                        data.UUID = this._ctx.UID;
                }
                delete data.CUID; delete data.CTime;
                delete data.DUID; delete data.DTime;
                delete data.AID;
                delete data.Key;
                delete data.GID;
                break;
            case Operate.Delete:
                if (field.includes('DTime')) {
                    data.DTime = new Date;
                    if (!data.DUID)
                        data.DUID = this._ctx.UID || 0;
                }
                delete data.CUID; delete data.CTime;
                delete data.UUID; delete data.UTime;
                break;

        }
        _.forOwn(data, (v, k) => {
            if (v === undefined) {
                delete data[k];
            }
        })
        return data;
    }
    /**
     * 添加一条数据
     * @param data 
     */
    public async add<T>(data: Object): Promise<T | any> {
        this._operate = Operate.Add
        await this.fixField(data);
        await hook.emit(ModelHooks.Add, HookWhen.Before, this, { args: arguments, data: {} })
        let d = await (await this.getModel()).create(data, this.changeOptions).catch((e: ExecException) => {
            if (e.message === 'Validation error') {
                e.message = '数据重复';
            } else if (e.message.includes('Cannot add or update a child row: a foreign key')) {
                e.message = '关联数据不存在'
            }
            throw e;
        })
        this._clean();
        let rs = read_value(d);
        await hook.emit(ModelHooks.Add, HookWhen.After, this, { args: arguments, data: rs })
        return rs;
    }
    /**
     * 设置数据内容
     * @param data 
     */
    public async data(data: Object) {
        (await this.getModel()).build(data)
        return this;
    }
    /**
     * 查找一个
     */
    public async find() {
        this._operate = Operate.Select
        let d = await this.limit(1).select()
        this._clean();
        return d[0]
    }
    /**
     * 批量添加数据
     * @param data
     * @returns {any}
     */
    public async addAll<T>(data: T[]): Promise<T[]> {
        this._operate = Operate.Add
        for (let x of data) {
            await this.fixField(x);
        }
        await hook.emit(ModelHooks.AddAll, HookWhen.Before, this, { args: arguments, data: {} })
        let d = await (await this.getModel()).bulkCreate(data, Object.assign({
            fields: Object.keys(data[0])
        }, this.changeOptions)).catch((e: ExecException) => {
            if (e.message === 'Validation error') {
                e.message = '数据重复';
            } else if (e.message.includes('Cannot add or update a child row: a foreign key')) {
                e.message = '关联数据不存在'
            }
            throw e;
        })
        this._clean();
        let rs = read_value(d)
        await hook.emit(ModelHooks.AddAll, HookWhen.After, this, { args: arguments, data: rs })
        return rs;
        // let ds: any = [];
        // d.forEach((v: any) => {
        //     ds.push(v.dataValues)
        // })
        // return ds;
    }
    /**
     * 取数量
     */
    public async count() {
        return await (await this.getModel()).count(await this._parse_config());
        // return 0;
    }
    /**
     * 支持selectAndCount
     * @returns {Promise<{count; rows: any[]}>}
     */
    public async selectAndCount<T>(): Promise<{ count: number, rows: T[] }> {
        this._operate = Operate.Select
        let d = await (await this.getModel()).findAndCountAll(await this._parse_config())
        // let data: any[] = [];
        // d.rows.forEach((v: any) => {
        //     data.push(v.dataValues)
        // })
        this._clean();
        return {
            count: d.count,
            rows: read_value(d.rows)
        };
    }
    /**
     * 设置limit参数，
     * @param {number} Number
     */
    public limit(Number: number): this {
        this._options.limit = Number;
        return this;
    }
    /**
     * 设置分页参数
     * @param {number} Page
     * @param {number} Number
     * @returns {Model.page}
     */
    public page(p: number, n: number): this {
        this._options.limit = Number(n);
        this._options.offset = (p - 1) * n;
        return this;
    }

    public group(fields: string[] | string) {
        this._options.group = 'string' == typeof fields ? fields.split(',') : fields;
        return this;
    }
    /**
     * 调用delete语句
     * @returns {any}
     */
    public async del(force: boolean = false): Promise<number> {
        this._operate = Operate.Delete
        let d = 0;
        let fields = await this.getDbTableFields();
        if (force === false && fields.indexOf('DTime') > -1) {
            let s: { [index: string]: any } = {
                DTime: Date.now()
            }
            if (fields.includes('DUID')) {
                s.DUID = this._ctx.UID;
            }
            d = await this.save(s, Operate.Delete)
        } else {
            this._operate = Operate.Delete
            d = await (await this.getModel()).destroy(Object.assign(await this._parse_config(), this.changeOptions))
        }
        this._clean();
        return d;
    }
    /**
     * 批量保存操作
     * @param config 
     */
    public async caseSave(config: {
        field: { save: string, case: string },
        data: { [index: string]: Sequelize.Utils.Literal | string | number },
        limit?: number
    }[]) {
        let Save: any = {};
        let Where: any = {};
        let CaseStr: string[] = [];
        let WhereStr: string[] = [];
        for (let i = 0; i < config.length; i++) {
            let { raw, where } = this._parse_case_save_config(config[i]);
            if (Where[config[i].field.case]) {
                Where[config[i].field.case] = Object.assign(Where[config[i].field.case], where)
            } else {
                Where[config[i].field.case] = where;
            }
            // Save[config[i].field.save] = Sequelize.literal(raw);
            CaseStr.push(`\`${config[i].field.save}\` = ` + raw)
        }
        _.forOwn(Where, (v: number[], k) => {
            Where[k] = { [Sequelize.Op.in]: _.uniq(v) }
            WhereStr.push(`\`${k}\` IN (${v.map(o => `'${o}'`).join(',')})`)
        })
        // let str = `UPDATE ${this._true_table_name} SET ${CaseStr.join(',')} WHERE ${WhereStr.join(' AND ')}`
        return await this.exec(`UPDATE ${this._true_table_name} SET ${CaseStr.join(',')} WHERE ${WhereStr.join(' AND ')}`, 'UPDATE');
    }
    /**
     * 解析生成caseSave数据 
     */
    protected _parse_case_save_config(config: {
        field: { save: string, case: string },
        data: { [index: string]: Sequelize.Utils.Literal | string | number },
        limit?: number
    }) {
        let CaseWhen = [];
        let CaseIDs = [];
        let keys = Object.keys(config.data);
        for (let i = 0; i < keys.length; i++) {
            let when = keys[i];
            let value = config.data[when];
            if ('string' == typeof value) {
                value = '"' + value.replace(/"/g, '\"') + '"'
            }
            CaseWhen.push(`WHEN ${when} THEN ${value}`);
            CaseIDs.push(when);
        }
        if (CaseIDs.length == 0) {
            throw new Error('NoCaseSaveData');
        }
        return {
            raw: `CASE \`${config.field.case}\` ${CaseWhen.join(' ')} ELSE \`${config.field.save}\` END`,
            where: CaseIDs
        };
    }
    /**
     * 调用save方法
     * @param data
     * @returns 
     */
    public async save(data: any, op?: Operate): Promise<number> {
        this._operate = op || Operate.Save
        data = await this.fixField(data)
        await hook.emit(ModelHooks.Save, HookWhen.Before, this, { args: arguments, data: {} })
        let d: number[] = await (await this.getModel()).update(data, Object.assign({
            where: await this._parse_where(),
            options: {
                returning: true
            }
        }, this.changeOptions))
        this._clean();
        await hook.emit(ModelHooks.Save, HookWhen.After, this, { args: arguments, data: d[0] })
        return d[0];
    }
    /**
     * 执行自定义请求
     * @param sql
     * @returns {any}
     */
    public async query(sql: string, conf?: Sequelize.QueryOptions) {
        await this.getModel()
        return await this.exec(sql, Sequelize.QueryTypes.SELECT, conf);
    }
    /**
     * 执行SQL
     * @param SQL 
     * @param Type 
     * @param conf 
     */
    public async exec(SQL: string, Type: Sequelize.QueryTypes | string, conf?: Sequelize.QueryOptions) {
        await this.getModel()
        return await this._db.query(SQL.replace(/__DB_PREFIX__/g, this._ctx.config.dbPrefix).replace(/__DB_TABLE__/g, this._true_table_name), Object.assign({ type: Type }, conf || {}, this.changeOptions))
    }
    /**
     * 开启事物
     * @returns Sequelize.Transaction
     */
    public async startTrans(): Promise<Sequelize.Transaction> {
        this.transaction = await this._ctx.config.startTrans()
        return this.transaction;
    }
    public setTrans(trans: Sequelize.Transaction) {
        this.transaction = trans;
        return this;
    }
    /**
     * 提交
     */
    public async commit() {
        await this._ctx.config.commit();
    }
    /**
     * 回滚
     */
    public async rollback() {
        await this._ctx.config.rollback();
    }
    /**
     * 清除查询条件，
     * @private
     */
    private _clean() {
        this._options.fields = [];
        this._options.where = {};
        if (!_.isUndefined(this._options.limit))
            delete this._options.limit;
        if (!_.isUndefined(this._options.offset))
            delete this._options.offset;

    }

    /**
     * 获取某个字段或以某个字段位键的对象
     * @param Fields
     * @param {boolean} More
     * @returns {any}
     */
    public async getFields<T>(Fields: string | string[], More = false): Promise<string | string[] | { [index: string]: T } | any> {
        this._operate = Operate.Select
        if (!More) {
            this.page(1, 1)
        }
        if (_.isString(Fields)) {
            Fields = Fields.split(',')
        }
        let rs: any = [];
        if (Fields.length > 0) {
            let d = await this.fields(Fields).select<T>()
            this._clean();
            var pk = Fields[0];
            if (d.length > 0) {
                if (More) {
                    var data: any = {};
                    var odata: any[] = [];
                    _.forOwn(d, (v: any, k) => {
                        if (Fields.length == 1) {
                            odata.push(v[pk])
                        } else {
                            data[v[pk]] = v;
                        }
                    })
                    rs = Fields.length == 1 ? odata : data;
                } else {
                    if (Fields.length == 1) {
                        rs = (<any>d[0])[pk];
                    } else {
                        rs = d[0];
                    }
                }
            } else {
                rs = More ? [] : ''
            }
        }
        else {
            rs = More ? [] : ''
        }
        this._clean();
        return rs;
    }
}

export const DbDataType = {
    char: Sequelize.CHAR,
    varchar: Sequelize.STRING,
    double: Sequelize.DOUBLE,
    float: Sequelize.FLOAT,
    text: Sequelize.TEXT,
    smallint: Sequelize.SMALLINT,
    tinyint: Sequelize.TINYINT,
    mediumint: Sequelize.MEDIUMINT,
    int: Sequelize.INTEGER,
    bigint: Sequelize.BIGINT,
    decimal: Sequelize.DECIMAL,
    boolean: Sequelize.BOOLEAN,
    enum: Sequelize.ENUM,
    datetime: Sequelize.DATE,
    timestamp: Sequelize.TIME,
    json: Sequelize.JSON,

}
export const DbOp = {
    eq: Sequelize.Op.eq,
    ne: Sequelize.Op.ne,
    neq: Sequelize.Op.ne,
    gte: Sequelize.Op.gte,
    gt: Sequelize.Op.gt,
    lte: Sequelize.Op.lte,
    lt: Sequelize.Op.lt,
    not: Sequelize.Op.not,
    is: Sequelize.Op.is,
    in: Sequelize.Op.in,
    notIn: Sequelize.Op.notIn,
    "not in": Sequelize.Op.notIn,
    like: Sequelize.Op.like,
    notLike: Sequelize.Op.notLike,
    iLike: Sequelize.Op.iLike,
    notILike: Sequelize.Op.notILike,
    regexp: Sequelize.Op.regexp,
    notRegexp: Sequelize.Op.notRegexp,
    iRegexp: Sequelize.Op.iRegexp,
    notIRegexp: Sequelize.Op.notIRegexp,
    between: Sequelize.Op.between,
    notBetween: Sequelize.Op.notBetween,
    overlap: Sequelize.Op.overlap,
    contains: Sequelize.Op.contains,
    contained: Sequelize.Op.contained,
    adjacent: Sequelize.Op.adjacent,
    strictLeft: Sequelize.Op.strictLeft,
    strictRight: Sequelize.Op.strictRight,
    noExtendRight: Sequelize.Op.noExtendRight,
    noExtendLeft: Sequelize.Op.noExtendLeft,
    and: Sequelize.Op.and,
    or: Sequelize.Op.or,
    any: Sequelize.Op.any,
    all: Sequelize.Op.all,
    values: Sequelize.Op.values,
    col: Sequelize.Op.col,
    placeholder: Sequelize.Op.placeholder,
    $eq: Sequelize.Op.eq,
    $ne: Sequelize.Op.ne,
    $neq: Sequelize.Op.ne,
    $gte: Sequelize.Op.gte,
    $gt: Sequelize.Op.gt,
    $lte: Sequelize.Op.lte,
    $lt: Sequelize.Op.lt,
    $not: Sequelize.Op.not,
    $is: Sequelize.Op.is,
    $in: Sequelize.Op.in,
    $notIn: Sequelize.Op.notIn,
    "$not in": Sequelize.Op.notIn,
    $like: Sequelize.Op.like,
    $notLike: Sequelize.Op.notLike,
    $iLike: Sequelize.Op.iLike,
    $notILike: Sequelize.Op.notILike,
    $regexp: Sequelize.Op.regexp,
    $notRegexp: Sequelize.Op.notRegexp,
    $iRegexp: Sequelize.Op.iRegexp,
    $notIRegexp: Sequelize.Op.notIRegexp,
    $between: Sequelize.Op.between,
    $notBetween: Sequelize.Op.notBetween,
    $overlap: Sequelize.Op.overlap,
    $contains: Sequelize.Op.contains,
    $contained: Sequelize.Op.contained,
    $adjacent: Sequelize.Op.adjacent,
    $strictLeft: Sequelize.Op.strictLeft,
    $strictRight: Sequelize.Op.strictRight,
    $noExtendRight: Sequelize.Op.noExtendRight,
    $noExtendLeft: Sequelize.Op.noExtendLeft,
    $and: Sequelize.Op.and,
    $or: Sequelize.Op.or,
    $any: Sequelize.Op.any,
    $all: Sequelize.Op.all,
    $values: Sequelize.Op.values,
    $col: Sequelize.Op.col,
    $placeholder: Sequelize.Op.placeholder,
    // join: Sequelize.Op.
}