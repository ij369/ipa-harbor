import React, { useMemo, useState } from 'react';
import { Box, Typography, Grid, Chip, Stack, Divider } from '@mui/joy';
import { useApp } from '../contexts/AppContext';
import IpaIcon from '../components/IpaIcon';
import { Check } from '@mui/icons-material';
import formatFileSize from '../utils/formatFileSize.js'

export default function DownloadManager() {
    const { taskList, fileList } = useApp();
    const [selectedFilter, setSelectedFilter] = useState('all');

    const allItems = useMemo(() => {
        const items = [];

        console.log('TaskList数据结构:', taskList);

        ['pending', 'running', 'failed', 'completed'].forEach(status => {
            if (taskList[status]) {
                taskList[status].forEach(task => {
                    // 从任务中提取应用信息
                    const appId = task.appId || task.id;
                    const fileName = task.fileName || `${appId}_${task.versionId || 'latest'}.ipa`;

                    // 提取进度信息
                    const progressInfo = task.progress || {};
                    const percentage = progressInfo.percentage || 0;
                    const sizeProgress = progressInfo.sizeProgress || progressInfo.description || task.progressText || '';

                    // 对于completed状态的任务，尝试从fileList中获取完整的metadata信息
                    let itemData = {
                        id: appId,
                        name: fileName,
                        status: status,
                        progress: percentage,
                        sizeProgress: sizeProgress,
                        downloadSpeed: progressInfo.downloadSpeed || '',
                        taskId: task.taskId || task.id,
                        type: 'task',
                        bundleId: task.bundleId
                    };

                    // 如果是completed状态，尝试从fileList中获取metadata
                    if (status === 'completed' && fileList.files) {
                        const matchingFile = fileList.files.find(file => file.name === fileName);
                        if (matchingFile) {
                            itemData = {
                                ...itemData,
                                size: matchingFile.size,
                                itemId: matchingFile.itemId,
                                bundleDisplayName: matchingFile.bundleDisplayName,
                                artistName: matchingFile.artistName,
                                bundleShortVersionString: matchingFile.bundleShortVersionString,
                                bundleVersion: matchingFile.bundleVersion,
                                productType: matchingFile.productType,
                                softwareVersionBundleId: matchingFile.softwareVersionBundleId,
                                softwareVersionExternalIdentifier: matchingFile.softwareVersionExternalIdentifier,
                                releaseDate: matchingFile.releaseDate,
                                createdAt: matchingFile.createdAt,
                                modifiedAt: matchingFile.modifiedAt
                            };
                        }
                    }

                    items.push(itemData);
                });
            }
        });

        // 已下载的文件（不在任务列表中的）
        if (fileList.files) {
            fileList.files.forEach(file => {
                const existsInTasks = items.some(item =>
                    item.name === file.name ||
                    (item.name && file.name && item.name.includes(file.name.split('_')[0]))
                );

                if (!existsInTasks) {
                    // 提取应用ID
                    const appId = file.name.match(/^(\d+)_/)?.[1];

                    items.push({
                        id: appId,
                        name: file.name,
                        status: 'downloaded',
                        progress: 100,
                        size: file.size,
                        type: 'file',
                        itemId: file.itemId,
                        bundleDisplayName: file.bundleDisplayName,
                        artistName: file.artistName,
                        bundleShortVersionString: file.bundleShortVersionString,
                        bundleVersion: file.bundleVersion,
                        productType: file.productType,
                        softwareVersionBundleId: file.softwareVersionBundleId,
                        softwareVersionExternalIdentifier: file.softwareVersionExternalIdentifier,
                        releaseDate: file.releaseDate,
                        createdAt: file.createdAt,
                        modifiedAt: file.modifiedAt
                    });
                }
            });
        }

        return items;
    }, [taskList, fileList]);

    const statusCounts = useMemo(() => {
        const counts = {
            pending: 0,
            running: 0,
            failed: 0,
            completed: 0,
            downloaded: 0
        };

        allItems.forEach(item => {
            counts[item.status] = (counts[item.status] || 0) + 1;
        });

        return counts;
    }, [allItems]);

    const filteredItems = useMemo(() => {
        if (selectedFilter === 'all') {
            return allItems;
        }
        return allItems.filter(item => item.status === selectedFilter);
    }, [allItems, selectedFilter]);

    return (
        <Box>
            <Stack onClick={() => { setSelectedFilter('all') }} direction="row" gap={2} sx={{ mb: 3, flexWrap: 'wrap', cursor: 'pointer' }}>
                <Typography level="h2" >
                    下载管理
                </Typography>
                {allItems.length}
            </Stack>

            <Stack direction="row" gap={2} sx={{ mb: 3, flexWrap: 'wrap' }}>
                <Chip
                    color="warning"
                    variant={selectedFilter === 'pending' ? 'solid' : 'soft'}
                    onClick={() => selectedFilter !== 'pending' ? setSelectedFilter('pending') : setSelectedFilter('all')}
                    sx={{ cursor: 'pointer' }}
                    startDecorator={selectedFilter !== 'pending' ? null : <Check />}
                >
                    等待中: {statusCounts.pending}
                </Chip>
                <Chip
                    color="primary"
                    variant={selectedFilter === 'running' ? 'solid' : 'soft'}
                    onClick={() => selectedFilter !== 'running' ? setSelectedFilter('running') : setSelectedFilter('all')}
                    sx={{ cursor: 'pointer' }}
                    startDecorator={selectedFilter !== 'running' ? null : <Check />}
                >
                    下载中: {statusCounts.running}
                </Chip>
                <Chip
                    color="danger"
                    variant={selectedFilter === 'failed' ? 'solid' : 'soft'}
                    onClick={() => selectedFilter !== 'failed' ? setSelectedFilter('failed') : setSelectedFilter('all')}
                    sx={{ cursor: 'pointer' }}
                    startDecorator={selectedFilter !== 'failed' ? null : <Check />}
                >
                    失败: {statusCounts.failed}
                </Chip>
                <Chip
                    color="success"
                    variant={selectedFilter === 'completed' ? 'solid' : 'soft'}
                    onClick={() => selectedFilter !== 'completed' ? setSelectedFilter('completed') : setSelectedFilter('all')}
                    sx={{ cursor: 'pointer' }}
                    startDecorator={selectedFilter !== 'completed' ? null : <Check />}
                >
                    完成: {statusCounts.completed}
                </Chip>
                <Chip
                    color="neutral"
                    variant={selectedFilter === 'downloaded' ? 'solid' : 'soft'}
                    onClick={() => selectedFilter !== 'downloaded' ? setSelectedFilter('downloaded') : setSelectedFilter('all')}
                    sx={{ cursor: 'pointer' }}
                    startDecorator={selectedFilter !== 'downloaded' ? null : <Check />}
                >
                    已下载: {statusCounts.downloaded}
                </Chip>
            </Stack>

            {filteredItems.length > 0 ? (
                <Grid
                    container
                    spacing={2}
                >
                    {filteredItems.map((item, index) => (
                        <Grid
                            key={`${item.type}-${item.id || item.name}-${index}`}
                            xs={6}
                            sm={4}
                            md={3}
                            lg={2}
                            xl={2}
                            sx={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                minHeight: 200,
                                p: 2,
                            }}
                        >
                            <IpaIcon
                                item={item}
                            />
                        </Grid>
                    ))}
                </Grid>
            ) : (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                    <Typography level="body-lg" sx={{ color: 'text.secondary' }}>
                        暂无记录
                    </Typography>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 1, cursor: selectedFilter === 'all' ? 'auto' : 'pointer' }} onClick={() => { setSelectedFilter('all') }}>
                        {selectedFilter === 'all' ? '前往首页搜索并下载应用' : '点击标题可以清除筛选'}
                    </Typography>
                </Box>
            )}

            {fileList.totalSize > 0 && (
                <Box sx={{ mt: 4, p: 2, backgroundColor: 'background.level1', borderRadius: 'md' }}>
                    <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                        总计 {fileList.total} 个文件，占用 {formatFileSize(fileList.totalSize)} 存储空间
                    </Typography>
                </Box>
            )}
        </Box>
    );
}

