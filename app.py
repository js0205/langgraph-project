#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LangGraph 简单示例应用
这是一个基本的 LangGraph 应用，演示了如何创建一个简单的状态图工作流
"""

from typing import TypedDict, Annotated
import operator
from langgraph.graph import StateGraph, END

# 定义状态结构
class State(TypedDict):
    """工作流状态定义"""
    messages: Annotated[list, operator.add]  # 消息列表
    counter: int  # 计数器

# 定义节点函数
def node_1(state: State) -> State:
    """第一个节点：初始化"""
    print("📍 执行节点 1: 初始化")
    return {
        "messages": ["节点1: 工作流已启动"],
        "counter": state.get("counter", 0) + 1
    }

def node_2(state: State) -> State:
    """第二个节点：处理"""
    print("📍 执行节点 2: 处理数据")
    return {
        "messages": [f"节点2: 正在处理 (计数: {state['counter']})"],
        "counter": state["counter"] + 1
    }

def node_3(state: State) -> State:
    """第三个节点：完成"""
    print("📍 执行节点 3: 完成")
    return {
        "messages": [f"节点3: 工作流完成 (总计数: {state['counter']})"],
        "counter": state["counter"] + 1
    }

# 条件路由函数
def should_continue(state: State) -> str:
    """决定是否继续处理或结束"""
    if state["counter"] < 3:
        return "continue"
    return "end"

def create_graph():
    """创建并配置 LangGraph 工作流"""
    # 创建状态图
    workflow = StateGraph(State)

    # 添加节点
    workflow.add_node("initialize", node_1)
    workflow.add_node("process", node_2)
    workflow.add_node("finalize", node_3)

    # 设置入口点
    workflow.set_entry_point("initialize")

    # 添加边（定义节点之间的流转）
    workflow.add_edge("initialize", "process")

    # 添加条件边
    workflow.add_conditional_edges(
        "process",
        should_continue,
        {
            "continue": "process",  # 继续循环
            "end": "finalize"  # 结束并转到最终节点
        }
    )

    # 设置终点
    workflow.add_edge("finalize", END)

    # 编译图
    app = workflow.compile()

    return app

def main():
    """主函数"""
    print("=" * 50)
    print("🚀 LangGraph 应用启动")
    print("=" * 50)

    # 创建图应用
    app = create_graph()

    # 初始状态
    initial_state = {
        "messages": [],
        "counter": 0
    }

    print("\n📋 开始执行工作流...\n")

    # 运行图
    result = app.invoke(initial_state)

    # 打印结果
    print("\n" + "=" * 50)
    print("✅ 工作流执行完成")
    print("=" * 50)
    print("\n📊 最终状态:")
    print(f"   计数器: {result['counter']}")
    print(f"\n💬 消息历史:")
    for i, msg in enumerate(result['messages'], 1):
        print(f"   {i}. {msg}")

    print("\n" + "=" * 50)
    print("🎉 应用运行结束")
    print("=" * 50)

if __name__ == "__main__":
    main()
