# CastleModel数据库操作类
> 封装的Sequelize作为数据库操作底层，对Sequelize的部分操作进行了简化，语法结构类似于ThinkPHP3.2结构。
# 典型基础用法
```typescript
import {M},Model from 'castle-model'
(async (ctx){
    ctx.body = await M(ctx,'模型名称').where({UID:1}).find()
    // SELECT * FROM 模型名称 WHERE UID = 1
})()
```