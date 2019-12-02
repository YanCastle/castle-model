import * as _ from 'lodash';
import * as Sequelize from "sequelize";
import { env } from 'process';
export const Op: any = Sequelize.Op;
export const Fn: any = Sequelize.fn;
export const Col: any = Sequelize.col;
export const QueryTypes = Sequelize.QueryTypes;
export enum Operate {
    Select, Add, Delete, Save
}
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
    public transaction: Sequelize.Transaction | any;
    private _options: Options = {
        fields: [], where: {}, group: [], exclude: []
    };
    private _config = {

    }
    private _operate: Operate = Operate.Select;
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
                w[k] = v;
            }
        });
        return w;
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
    private _parse_where() {
        return Model.parseWhere(this._options.where);
    }
    /**
     * 获取查询字段
     * @returns {Array}
     * @private
     */
    private _parse_fields() {
        let rs = []
        if (this._options.fields.length == 0) {
            rs = this._ctx.config.getDbTableFields(this._table_name)
        } else {
            rs = this._options.fields instanceof Function ? this._options.fields(this._ctx) : this._options.fields;
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
    private _parse_order() {
        var order: string[] = [];
        if ("string" == typeof this._options.order) {
            this._options.order = this._options.order.split(',')
        }
        if (this._options.order instanceof Array) {
            _.forOwn(this._options.order, (v: any, k: any) => {
                order.push(v.split(' '))
            })
        }
        return order;
    }
    /**
     * 解析配置文件，生成查询属性
     * @returns {{}}
     * @private
     */
    private _parse_config() {
        let config: any = {};
        config['attributes'] = this._parse_fields();
        config['where'] = this._parse_where();
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
    public async getModel(): Promise<any> {
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
     * 自增或自减
     * @param config 
     */
    public async incOrDec(config: { [index: string]: number }) {
        let db = await this.getModel()
        this._operate = Operate.Save;
        let keys = Object.keys(config);
        if (keys.length > 0) {
            let data: { [index: string]: Sequelize.literal } = {};
            for (let i = 0; i < keys.length; i++) {
                data[keys[i]] = Sequelize.literal(`\`${keys[i]}\`${config[keys[i]] > 0 ? '+' : ''}${config[keys[i]]}`)
            }
            let d = await db.update(data, Object.assign({
                where: this._parse_where(),
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
    public async select() {
        this._operate = Operate.Select
        let d = await (await this.getModel()).findAll(this._parse_config())
        this._clean();
        return read_value(d);
        // let data: any = [];
        // d.forEach((v: any) => {
        //     data.push(v.dataValues)
        // })
        // return data;
    }
    public async add(data: Object) {
        this._operate = Operate.Add
        let d = await (await this.getModel()).create(data, this.changeOptions)
        this._clean();
        return read_value(d);
    }
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
    public async addAll(data: any) {
        this._operate = Operate.Add
        let d = await (await this.getModel()).bulkCreate(data, Object.assign({
            fields: Object.keys(data[0])
        }, this.changeOptions))
        this._clean();
        return read_value(d)
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
        return 0;
    }
    /**
     * 支持selectAndCount
     * @returns {Promise<{count; rows: any[]}>}
     */
    public async selectAndCount() {
        this._operate = Operate.Select
        let d = await (await this.getModel()).findAndCountAll(this._parse_config())
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
    public limit(Number: number) {
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
    public async del(): Promise<number> {
        this._operate = Operate.Delete
        let d = 0;
        if ((await this.getDbTableFields()).indexOf('DTime') > -1) {
            d = await this.save({ DTime: Date.now() })
        } else {
            this._operate = Operate.Delete
            d = await (await this.getModel()).destroy(Object.assign(this._parse_config(), this.changeOptions))
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
        data: { [index: string]: Sequelize.literal | string | number },
        limit?: number
    }[]) {
        let Save: any = {};
        let Where: any = {};
        for (let i = 0; i < config.length; i++) {
            let { raw, where } = this._parse_case_save_config(config[i]);
            if (Where[config[i].field.case]) {
                Where[config[i].field.case] = Object.assign(Where[config[i].field.case], where)
            } else {
                Where[config[i].field.case] = where;
            }
            Save[config[i].field.save] = Sequelize.literal(raw);
        }
        _.forOwn(Where, (v, k) => {
            Where[k] = { [Sequelize.Op.in]: _.uniq(v) }
        })
        return await this.where(Where).save(Save);
    }
    /**
     * 解析生成caseSave数据 
     */
    protected _parse_case_save_config(config: {
        field: { save: string, case: string },
        data: { [index: string]: Sequelize.literal | string | number },
        limit?: number
    }) {
        let CaseWhen: string[] = [];
        let CaseIDs: string[] = [];
        let keys = Object.keys(config.data);
        for (let i = 0; i < keys.length; i++) {
            let when = keys[i];
            let value = config.data[when];
            CaseWhen.push(`WHEN ${when} THEN ${value}`)
            CaseIDs.push(when);
        }
        if (CaseIDs.length == 0) { throw new Error('NoCaseSaveData') }
        return {
            raw: `CASE ${config.field.case} ${CaseWhen.join(' ')} ELSE ${config.field.save} END`,
            where: CaseIDs
        }
    }
    /**
     * 调用save方法
     * @param data
     * @returns 
     */
    public async save(data: any): Promise<number> {
        this._operate = Operate.Save
        let d: number[] = await (await this.getModel()).update(data, Object.assign({
            where: this._parse_where(),
            options: {
                returning: true
            }
        }, this.changeOptions))
        this._clean();
        return d[0];
    }
    /**
     * 执行自定义请求
     * @param sql
     * @returns {any}
     */
    public async query(sql: string) {
        await this.getModel()
        return await this._db.query(sql.replace(/__DB_PREFIX__/g, this._ctx.config.dbPrefix), Object.assign({
            type: Sequelize.QueryTypes.SELECT
        }, this.changeOptions));
    }
    public async exec(SQL: string, Type: Sequelize.QueryTypes | string) {
        await this.getModel()
        return await this._db.query(SQL.replace(/__DB_PREFIX__/g, this._ctx.config.dbPrefix), Object.assign({ type: Type }, this.changeOptions))
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
     * 获取某个字段
     * @param Fields
     * @param {boolean} More
     * @returns {any}
     */
    public async getFields(Fields: string | string[], More = false) {
        this._operate = Operate.Select
        if (!More) {
            this.page(1, 1)
        }
        if (_.isString(Fields)) {
            Fields = Fields.split(',')
        }
        if (Fields.length > 0) {
            let d = await this.fields(Fields).select()
            this._clean();
            var pk = Fields[0];
            if (d.length > 0) {
                if (More) {
                    var data: any = {};
                    var odata: any[] = [];
                    _.forOwn(d, (v, k) => {
                        if (Fields.length == 1) {
                            odata.push(v[pk])
                        } else {
                            data[v[pk]] = v;
                        }
                    })
                    return Fields.length == 1 ? odata : data;
                } else {
                    if (Fields.length == 1) {
                        return d[0][pk];
                    } else {
                        return d[0];
                    }
                }
            } else {
                return More ? [] : ''
            }
        }
        else {
            return More ? [] : ''
        }
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
    // join: Sequelize.Op.
}