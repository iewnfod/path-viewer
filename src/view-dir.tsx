import { Action, ActionPanel, confirmAlert, Detail, getPreferenceValues, Icon, LaunchProps, List } from "@raycast/api";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { runAppleScript } from "@raycast/utils";

async function openFile(p: Path) {
  if (p.stringPath == '') return;
  let belongUser = await ifPathBelongToUser(p);
  let addition = '';
  if (!belongUser) {
    if (await confirmAlert({title: `\`${p.name}\` is not belong to you, do you want to open it with root?`})) {
      addition = 'sudo';
    }
  }
  runAppleScript(`do shell script "${addition} open '${p.stringPath}'"`).then().catch();
}

async function ifPathBelongToUser(p: Path) {
  let appleScript = `
  -- 要检查的文件路径
set filePath to "${p.stringPath}"

-- 目标用户
set targetUser to "${os.userInfo().username}"

-- 获取文件的所有者

set fileOwner to (do shell script "stat -f %Su " & quoted form of filePath)

-- 检查文件的所有者是否与目标用户匹配
if fileOwner is equal to targetUser then
    set result to "true"
else
    set result to "false"
end if

do shell script "echo " & quoted form of result
  `;
  try {
    const result = await runAppleScript(appleScript);
    console.log(result);
    return result == 'true';
  } catch (e) {
    console.log(e);
  }
}

// 读取偏好设置
type Preferences = {
  defaultPath: string;
  ignoreName: string;
  showHidden: boolean;
  appAsFile: boolean;
  sortType: string;
}
const preferences: Preferences = getPreferenceValues();

// 加载需要隐藏的文件
let ignoreArr: string[] = [];
preferences.ignoreName.split(',').forEach((name) => {
  ignoreArr.push(name.trim());
});

// 加载排序方式
let sortFn: ((a: Path, b: Path) => number) | undefined;
if (preferences.sortType[0] == 'n') {
  sortFn = (a: Path, b: Path) => {
    return a.name.localeCompare(b.name);
  }
} else if (preferences.sortType[0] == 'e') {
  sortFn = (a: Path, b: Path) => {
    return a.extension.localeCompare(b.extension);
  }
}
let reverse = false;
if (preferences.sortType[1] == 'd') {
  reverse = true;
}

/**
 * 路径类型，用于更方便的储存一些常用的数据
 * @constructor
 * @param p 路径字符串
 */
class Path {
  public name: string;
  public extension: string;
  public stringPath: string;
  public exists: boolean;
  public isFolder?: boolean;
  public parent?: string;
  constructor(public p: string) {
    this.stringPath = p;
    this.name = path.basename(p);
    this.extension = path.extname(p);
    this.exists = fs.existsSync(p);
    if (this.exists) {
      this.parent = path.dirname(p);
      this.isFolder = fs.statSync(p).isDirectory();
    }
  }

  /**
   * 获取文件图标
   */
  getIcon() {
    if (this.extension == '.app') {
      return Icon.AppWindowGrid2x2;
    }
    if (this.isFolder) {
      return Icon.Folder;
    } else {
      if (this.extension == '') {
        return Icon.AppWindowList;
      }
      return Icon.Text;
    }
  }
}

/**
 * 加载路径，收集一个字符串路径下包含的所有文件以及目录并返回
 * @param targetPath 目标路径
 */
function loadPath(targetPath: string) {
  let files: Path[] = [];
  let folders: Path[] = [];
  let f = new Path(targetPath);
  // 遍历文件夹
  try {
    fs.readdirSync(targetPath).forEach((f) => {
      // 如果要被忽略，那就退出
      if (ignoreArr.indexOf(f) >= 0) {
        return;
      }
      // 如果是.开头的文件或文件夹，说明他是隐藏文件，并且用户没有选择显示隐藏文件，才能隐藏
      if (f.startsWith('.') && !preferences.showHidden) {
        return;
      }
      let newPath = path.join(targetPath, f);
      let pathItem = new Path(newPath);
      if (pathItem.exists) {
        if (pathItem.extension === '.app' && preferences.appAsFile) {
          files.push(pathItem);
        } else {
          if (pathItem.isFolder) {
            folders.push(pathItem);
          } else {
            files.push(pathItem);
          }
        }
      }
    });
  } catch (e) {
    let item = new Path('');
    item.name = `Permission denied to scan \`${f.stringPath}\``;
    files.push(item);
  }
  // 排序
  if (sortFn != undefined) {
    files.sort(sortFn);
    folders.sort(sortFn);
  }
  if (reverse) {
    files.reverse();
    folders.reverse();
  }
  return { f, files, folders };
}

/**
 * 路径不存在错误
 * @param errPath 错误路径
 */
function pathNotExistError(errPath: string) {
  return  (
    <Detail
      markdown={`
# Path \`${errPath}\` does not exist.
    `}
    />
  );
}

/**
 * 路径不是目录错误
 * @param errPath 错误路径
 */
function pathIsFolderError(errPath: string) {
  return (
    <Detail
      markdown={`
# Path \`${errPath}\` is not a folder.
    `}
    />
  );
}

/**
 * 用于进入文件夹
 * @param props 包含一个参数`p`为需要进入的目录路径
 */
function IntoFolder(props: { p: Path }) {
  return (
    <Action.Push
      icon={Icon.ArrowRight}
      title={`Into ${props.p.name}`}
      target={renderList(loadPath(props.p.stringPath))}
    />
  );
}

type folderData = { f: Path, files: Path[], folders: Path[] };

/**
 * 渲染列表，将所有当前目录下的文件以及路径渲染出来，同时绑定事件
 * @param f 当前目录
 * @param files 文件列表
 * @param folders 文件夹列表
 */
function renderList({f, files, folders}: folderData) {
  let fileList;
  if (files.length != 0) {
    fileList = (
      <List.Section title="Files">
        {files.map((f) => <List.Item
          key={f.name}
          title={f.name}
          icon={f.getIcon()}
          actions={
            <ActionPanel>
              <Action title={`Open ${f.stringPath}`} onAction={() => openFile(f)}/>
              <Action.CopyToClipboard content={f.stringPath} title={`Copy Path ti Clipboard`}/>
              <Action.ShowInFinder path={f.stringPath} title={`Show in Finder`}/>
            </ActionPanel>
          }
        />)}
      </List.Section>
    );
  }

  let folderList;
  if (folders.length != 0) {
    folderList = (
      <List.Section title="Folders">
        {folders.map((f) => <List.Item
          key={f.name}
          title={f.name}
          icon={f.getIcon()}
          actions={
            <ActionPanel>
              <IntoFolder p={f}/>
              <Action.CopyToClipboard content={f.stringPath} title={`Copy Path to Clipboard`}/>
              <Action.ShowInFinder path={f.stringPath} title={`Show in Finder`}/>
            </ActionPanel>
          }
        />)}
      </List.Section>
    );
  }

  let backToLast;
  if (f.parent && f.stringPath != '/') {
    backToLast = (
      <List.Item
        title={"Back to Last"}
        icon={Icon.ArrowLeft}
        actions={
          <ActionPanel>
            <IntoFolder p={new Path(f.parent)}/>
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List navigationTitle={f.stringPath}>
      {backToLast}
      {fileList}
      {folderList}
    </List>
  );
}

/**
 * 解析路径，用于将 ~/ 转换为当前用户的主目录
 * @param p 需要解析的路径
 */
function resolvePath(p: string) {
  if (p.startsWith('~/')) {
    return path.resolve(os.homedir(), p.slice(2));
  } else {
    return p;
  }
}


export default function Command(props: LaunchProps<{ arguments: Arguments.ViewDir }>) {
  // 读取并预处理输入
  let targetPath = props.arguments.path;
  if (targetPath === '') {
    targetPath = preferences.defaultPath;
  }
  targetPath = resolvePath(targetPath);

  // 报错
  if (!fs.existsSync(targetPath)) {
    return pathNotExistError(targetPath);
  }
  if (!new Path(targetPath).isFolder) {
    return pathIsFolderError(targetPath);
  }

  // 处理并渲染
  return renderList(loadPath(targetPath));
}
