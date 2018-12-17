import * as _ from 'lodash';
import * as Sequelize from "sequelize";
export const Op: any = Sequelize.Op;
export const QueryTypes = Sequelize.QueryTypes;
export enum Operate {
    Select, Add, Delete, Save
}
export interface Options {
    fields: any[],
    where: any,
    group: string[],
    order?: string[] | string,
    limit?: number,
    offset?: number,
}
/**
 * 实例化的M方法
 * @param ctx 
 * @param Table 
 */
export function M(ctx: any | any, Table: string): Model {
    return new Model(ctx, Table);
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
        fields: [], where: {}, group: []
    };
    private _config = {

    }
    private _operate: Operate = Operate.Select;
    public static parseWhere(where: Object) {
        var w: any = {};
        _.forOwn(where, (v, k) => {
            if (v instanceof Array) {
                w[Op[k]] = v;
            } else if ('object' == typeof v) {
                w[k] = Model.parseWhere(v);
            } else if (Op[k])
                w[Op[k]] = v;
            else {
                w[k] = v;
            }
        });
        return w;
    }
    get changeOptions() {
        let d: any = {};
        if (this.transaction) { d.transaction = this.transaction }
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
        if (this._options.fields.length == 0) {
            return this._ctx.config.getDbTableFields(this._table_name)
        }
        return this._options.fields;
    }
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
        if (this.transaction) {
            config.transaction = this.transaction;
        }
        return config;
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
    public async addIfNotExist(data: Object, where = null) {
        let d = await this.where(where || data).find()
        if (_.isObject(d)) {
            //存在
            return true;
        } else {
            //不存在
            return await this.add(data)
        }
    }
    /**
     * 
     * @param config 
     */
    public async setDec(config: { [index: string]: number }) {
        if (Object.keys(config).length > 0) {

        }
        throw new Error('NotSupport')
    }
    /**
     * 
     * @param config 
     */
    public async setInc(config: { [index: string]: number }) {
        throw new Error('NotSupport')
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
    public fields(fields: string | string[] | any, exclude = false) {
        if (_.isArray(fields)) {
            this._options.fields = _.concat(this._options.fields, fields)
        } else if (_.isString(fields)) {
            this._options.fields = _.concat(this._options.fields, fields.split(','))
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
        let data: any = [];
        this._clean();
        d.forEach((v: any) => {
            data.push(v.dataValues)
        })
        return data;
    }
    public async add(data: Object) {
        this._operate = Operate.Add
        let d = await (await this.getModel()).create(data, this.changeOptions)
        this._clean();
        return d.dataValues
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
        let ds: any = [];
        d.forEach((v: any) => {
            ds.push(v.dataValues)
        })
        return ds;
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
        let data: any[] = [];
        d.rows.forEach((v: any) => {
            data.push(v.dataValues)
        })
        this._clean();
        return {
            count: d.count,
            rows: data
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

    public group(fields: string[]) {
        this._options.group = fields;
        return this;
    }
    /**
     * 调用delete语句
     * @returns {any}
     */
    public async del(): Promise<number> {
        this._operate = Operate.Delete
        let d = await (await this.getModel()).destroy(Object.assign({
            where: this._parse_where(),
        }, this.changeOptions))
        this._clean();
        return d;
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
    public query(sql: string) {
        return this._db.query(sql.replace(/__DB_PREFIX__/g, this._ctx.config.dbPrefix), {
            type: Sequelize.QueryTypes.SELECT
        });
    }
    public exec(SQL: string, Type: Sequelize.QueryTypes | string) {
        return this._db.query(SQL.replace(/__DB_PREFIX__/g, this._ctx.config.dbPrefix), Object.assign({ type: Type }, this.changeOptions))
    }
    /**
     * 开启事物
     * @returns Sequelize.Transaction
     */
    public async startTrans(): Promise<Sequelize.Transaction> {
        this.transaction = await this._ctx.config.db.transaction()
        return this.transaction;
    }
    public setTrans(trans: Sequelize.Transaction) {
        this.transaction = trans;
        return this;
    }
    /**
     * 提交
     */
    public commit() {
        this.transaction.commit();
    }
    /**
     * 回滚
     */
    public rollback() {
        this.transaction.rollback();
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
    double: Sequelize["DOUBLE PRECISION"],
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
    join: Sequelize.Op.join
}