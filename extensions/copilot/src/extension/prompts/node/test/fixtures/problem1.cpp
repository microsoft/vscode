#include "BinaryTreeProblems.h"
#include<stack>
/*
 * 题目1: 统计二叉树中度为1的结点个数
 *
 * 请在此处完成你的代码：
 */
int countDegreeOneNodes(TreeNode* rootss) {
    int ans=0;
    auto root=rootss;
    std::stack<TreeNode*>s;
    while (!s.empty() or root)
    {
        while(root){
            s.push(root);
            root=root->left;
        }
        if (!s.empty())
        {
            auto top=s.top();
            s.pop();
            if (top->left==nullptr and top->right==nullptr)
            {
                if(top!=rootss) ans+=1;
            }
            root=root->right;
        }
    }
    if(rootss->left==nullptr xor rootss->right==nullptr) ans+=1;
    // 在这里实现函数
    return ans;
}
