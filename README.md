# CastleModel数据库操作类
> 封装的Sequelize作为数据库操作底层，对Sequelize的部分操作进行了简化，语法结构类似于ThinkPHP3.2结构。
# 典型基础用法
```typescript
//获取模型对象
let model = await this.M('Sex');
//启动事务
await this.startTrans();
//添加数据
await model.add({ UID: 6, Sex: 1 });
//批量添加
await model.addAll([
    {
        UID: 6, Sex: 1
    },
    {
        UID: 8, Sex: 1
    },
])
//更新数据
await model.where({ UID: { gt: 7 } }).limit(1).save({ Sex: 100 });
//自增自减处理,UID>7的Sex全部-1,UID+1
await model.where({ UID: { gt: 7 } }).incOrDec({ Sex: -1, UID: 1 })
//当存在DTime时自动做软删除，否则就是硬删除
await model.where({ UID: { gt: 8 } }).del()
//查询单个
await model.where({ UID: { gt: 8 } }).find()
//分页查询多个
await model.where({ UID: { gt: 1 } }).page(1, 10).select()
// 查询并统计
await model.where({ UID: { gt: 1 } }).selectAndCount();
//指定字段查询
await model.fields('UID').find()
//排除字段查询
await model.fields('UID', true).find()
//批量条件更新，仅支持MySQL
await model.caseSave([{ field: { case: 'UID', save: "Sex" }, data: { 1: 2, 5: 10, 7: "`Sex`+5" } }])
//执行自定义SQL查询，通过__DB_PREFIX__注入表前缀
await model.query(`SELECT * FROM __DB_PREFIX__sex`)
//执行自定义SQL，
await model.exec(`UPDATE Sex SET UID=UID+1`, 'UPDATE')
//执行存储过程或函数
await model.exec(`CALL reset();`, 'RAW')
//查询单个字段且只要一个
await model.getFields('Sex');
//查询单个字段且返回数组
await model.getFields('Sex', true);
//支持排序
await model.order('UID DESC').select();
//支持group操作
await model.group(['UID']).fields([[Sequelize.fn('sum', Sequelize.col('UID')), 'UID']]).select()
//支持SUM等统计函数处理
await model.fnField(DbFn.SUM, 'UID', 'UID').group(['Sex']).select();
//支持limit，不适用page方法时
await model.limit(1).select();
//支持直接封装的SUM操作
await model.group(['UID']).sum('UID')
//支持自动检测是否存在，若不存在则自动添加
await model.addIfNotExist({ UID: 10, Sex: 1 })
//也可以自定义存在检测条件
await model.addIfNotExist({ UID: 11, Sex: 1 }, { UID: 11 })
//提交事务，两种方式都行，此处的this指向 BaseController
await this.commit();
await model.commit()
//回滚事务，两种方式都行
await this.rollback();
await model.rollback()
//支持嵌套事务
await this.startTrans();
await this.startTrans();
await this.startTrans();
await this.commit();
await this.commit();
await this.commit();
//当提交次数=开起次数时最后一次提交，之后的commit会报错
await this.commit();
//若中途发生一次rollback调用则会直接抛出错误
await this.rollback()
```